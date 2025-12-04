// index.mjs
// Make sure "type": "module" is set in your package.json

import express from 'express';
import dotenv from 'dotenv';
dotenv.config();
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import session from 'express-session';
import fetch from 'node-fetch'; // install if needed: npm install node-fetch

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

//clevland api
const CMA_BASE_URL = 'https://openaccess-api.clevelandart.org/api/artworks';

//This doesn't work for me 

// === DATABASE CONNECTION ===
/*const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionLimit: 10,
  waitForConnections: true
});
*/


const pool = mysql.createPool({
  host: "qzkp8ry756433yd4.cbetxkdyhwsb.us-east-1.rds.amazonaws.com",
  user: "hp5kv96qd6go6fxd",
  password: "rfv8ruc9kkf7jyk0",
  database: "fizq4mcj27thn5n2",
  connectionLimit: 10,
  waitForConnections: true
});
//Song by mood
//  store Deezers track id as the ID in `spotify_id`.
//Most of this code is similar to the examples that I saw and were  provide on the api page of deezer.
async function getSongsByMood(mood) {
  const q = (mood || '').trim();
  if (!q) return [];

  const url = `https://api.deezer.com/search?q=${encodeURIComponent(q)}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error('Deezer API error:', response.status);
      return [];
    }
    const data = await response.json();
    return Array.isArray(data.data) ? data.data : [];
  } catch (err) {
    console.error('Error fetching songs from Deezer:', err);
    return [];
  }
}

// Uses my databases songs, table: id, spotify_id, title, artist, cover_img, preview_url.
//it's under spotify_id because I thought we were going to use the spotify API an I just never changed the name.
async function findOrCreateSongFromDeezer(track) {
  const deezerId = String(track.id);
  const title = track.title || 'Untitled';
  const artist = (track.artist && track.artist.name) || 'Unknown Artist';
  const coverImg =
    (track.album && (track.album.cover_big || track.album.cover_medium)) || '';
  const previewUrl = track.preview || track.link || '';

  //  Checks to see if songs is repeated or exists already
  const [rows] = await pool.query(
    'SELECT id FROM songs WHERE spotify_id = ? LIMIT 1',
    [deezerId]
  );
  if (rows.length > 0) {
    return rows[0].id;
  }

  // adds new song
  const [result] = await pool.query(
    'INSERT INTO songs (spotify_id, title, artist, cover_img, preview_url) VALUES (?, ?, ?, ?, ?)',
    [deezerId, title, artist, coverImg, previewUrl]
  );

  return result.insertId;
}

// Middleware
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'change-this-secret',
    resave: false,
    saveUninitialized: false
  })
);

function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/sign-in');
  next();
}

// root
app.get('/', (req, res) => {
  if (req.session.user) return res.redirect('/home');
  res.redirect('/sign-in');
});

// signup.ejs
app.get('/sign-up', (req, res) => {
  res.render('signUp', {
    error: null,
    currentUser: req.session.user || null
  });
});

app.post('/sign-up', async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.render('signUp', {
      error: 'All fields are required.',
      currentUser: null
    });
  }
  try {
    const [existing] = await pool.query(
      'SELECT id FROM userInfo WHERE email = ?',
      [email]
    );
    if (existing.length > 0) {
      return res.render('signUp', {
        error: 'An account with that email already exists.',
        currentUser: null
      });
    }
    await pool.query(
      'INSERT INTO userInfo (username, email, password) VALUES (?, ?, ?)',
      [username, email, password]
    );
    res.redirect('/sign-in');
  } catch (err) {
    console.error(err);
    res.render('signUp', {
      error: 'Something went wrong. Please try again.',
      currentUser: null
    });
  }
});


// Sign in
app.get('/sign-in', (req, res) => {
  res.render('signIn', {
    error: null,
    currentUser: req.session.user || null
  });
});
//signin route
app.post('/sign-in', async (req, res) => {
  const { email, password } = req.body;
  try {
    const [rows] = await pool.query(
      'SELECT id, username, email FROM userInfo WHERE email = ? AND password = ?',
      [email, password]
    );

    if (rows.length === 0) {
      return res.render('signIn', {
        error: 'Invalid email or password.',
        currentUser: null
      });
    }
    const user = rows[0];
    req.session.user = {
      id: user.id,
      username: user.username,
      email: user.email
    };

    res.redirect('/home');
  } catch (err) {
    console.error(err);
    res.render('signIn', {
      error: 'Something went wrong. Please try again.',
      currentUser: null
    });
  }
});

// logs user out of account
app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/sign-in'));
});


//home.ejs
app.get('/home', requireLogin, async (req, res) => {
  const feeling = (req.query.q || '').trim();
  let artworks = [];
  let songs = [];
  let error = null;
  let collections = [];

  try {
    // Load the current users collections for the dropdown
    const [collectionRows] = await pool.query(
      'SELECT id, name, emotion FROM user_collections WHERE user_id = ? ORDER BY created_at DESC',
      [req.session.user.id]
    );
    collections = collectionRows;
  } catch (err) {
    console.error(err);
    error = 'Could not load your collections.';
  }

  if (!feeling) {
    return res.render('home', {
      feeling: '',
      artworks,
      songs,
      error,
      currentUser: req.session.user,
      collections
    });
  }

  try {
    // Artworks
    const url = new URL(CMA_BASE_URL);
    url.searchParams.set('q', feeling);
    url.searchParams.set('cc0', '1');
    url.searchParams.set('has_image', '1');
    url.searchParams.set('limit', '12');

    const response = await fetch(url.href);
    if (!response.ok) throw new Error('CMA API error ' + response.status);

    const json = await response.json();
    const dataArray = Array.isArray(json.data) ? json.data : [];

    artworks = dataArray.map(item => {
      const artist =
        Array.isArray(item.creators) && item.creators.length > 0
          ? item.creators[0].description
          : 'Unknown Artist';

      const image = item.images?.web?.url || null;

      // artworks id 
      return {
        id: item.id,            
        title: item.title || 'Untitled',
        artist,
        image
      };
    });

    // Gets a song from deezer based on the users feeling
    songs = await getSongsByMood(feeling);
  } catch (err) {
    console.error(err);
    error = 'Could not load artworks or songs.';
  }

  res.render('home', {
    feeling,
    artworks,
    songs,
    error,
    currentUser: req.session.user,
    collections
  });
});

// Saves the sonngs that appear in the collection
app.post('/songs/save', requireLogin, async (req, res) => {
  const { deezer_id, title, artist, cover_img, preview_url } = req.body;

  try {
    const fakeTrack = {
      id: deezer_id,
      title,
      preview: preview_url,
      link: preview_url,
      artist: { name: artist },
      album: { cover_medium: cover_img, cover_big: cover_img }
    };

    await findOrCreateSongFromDeezer(fakeTrack);
    res.redirect('back');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error saving song');
  }
});


// Viewsaved songs route
app.get('/songs', requireLogin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, title, artist, cover_img, preview_url FROM songs ORDER BY id DESC'
    );
    res.render('songs', {
      songs: rows,
      currentUser: req.session.user
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error loading songs');
  }
});

//creates collections 
app.get('/collections', requireLogin, async (req, res) => {
  const userId = req.session.user.id;

  try {
    const [collections] = await pool.query(
      'SELECT id, name, emotion, created_at FROM user_collections WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );

    res.render('collections', {
      collections,
      currentUser: req.session.user,
      error: null
    });
  } catch (err) {
    console.error(err);
    res.render('collections', {
      collections: [],
      currentUser: req.session.user,
      error: 'Could not load your collections.'
    });
  }
});

app.post('/collections', requireLogin, async (req, res) => {
  const userId = req.session.user.id;
  const { name, emotion } = req.body;

  if (!name || !name.trim()) {
    return res.redirect('/collections');
  }

  try {
    await pool.query(
      'INSERT INTO user_collections (user_id, name, emotion) VALUES (?, ?, ?)',
      [userId, name.trim(), emotion || null]
    );
    res.redirect('/collections');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error creating collection');
  }
});


// Adds the users artwork to their collection
app.post('/collections/:id/add', requireLogin, async (req, res) => {
  const userId = req.session.user.id;
  const collectionId = req.params.id;
  const { cma_id, title, artist, image_url } = req.body;

  try {
    const [colRows] = await pool.query(
      'SELECT id FROM user_collections WHERE id = ? AND user_id = ?',
      [collectionId, userId]
    );
    if (colRows.length === 0) {
      return res.status(403).send('Not your collection');
    }

    const [artRows] = await pool.query(
      'SELECT id FROM artworks WHERE cma_id = ?',
      [cma_id]
    );

    let artworkId;

    if (artRows.length === 0) {
      const [insertResult] = await pool.query(
        'INSERT INTO artworks (cma_id, title, artist, image_url) VALUES (?, ?, ?, ?)',
        [cma_id, title, artist, image_url]
      );
      artworkId = insertResult.insertId;
    } else {
      artworkId = artRows[0].id;
    }

    // Thos moves the artworks to the collection 
    await pool.query(
      'INSERT INTO collection_items (collection_id, artwork_id, song_id) VALUES (?, ?, NULL)',
      [collectionId, artworkId]
    );

    res.redirect('back');
    console.error(err);
    res.status(500).send('Error adding artwork to collection');
  }
});

app.use((req, res) => res.status(404).send('Page not found'));

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));


