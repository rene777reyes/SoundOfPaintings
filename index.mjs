import 'dotenv/config';
import express from 'express';
import mysql from 'mysql2/promise';
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();
import fetch from 'node-fetch';
import session from 'express-session';
import bcrypt from 'bcrypt';
//import { getPlayableSongsByMood } from './public/js/script.js';

//Middleware

const app = express();

app.set('view engine', 'ejs');
app.use(express.static('public'));

//for AJAX json 
app.use(express.json());
// for normal forms
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET,  
    resave: false,
    saveUninitialized: false
}));

app.use((req, res, next) => {
    res.locals.session = req.session;
    next();
});

//setting up database connection pool
const pool = mysql.createPool({
    host: "qn66usrj1lwdk1cc.cbetxkdyhwsb.us-east-1.rds.amazonaws.com",
    user: "wio9z639w46xw6q8",
    password: "kxmxh2ebd9qx2b30",
    database: "f3orc0h59yrjbdbz",
    connectionLimit: 10,
    waitForConnections: true
});

function isAuthenticated(req, res, next) {
    if (req.session && req.session.userId) {
        return next();
    }
    res.redirect('/login');
}

function isAdmin(req, res, next) {
    if (req.session && req.session.role === 'admin') {
        return next();
    }
    res.status(403).send('Forbidden: admins only');
}

//Paintings API is working 
export const getArtworks = async (keyword, skip, limit) => {
    const url = "https://openaccess-api.clevelandart.org/api/artworks";
    const params = {
        q: keyword,
        skip: skip,
        limit: limit,
        has_image: 1
    };

    try {
        const resp = await axios(url, { params });
        return resp.data.data;
        /*
        const images = {};
        // Adds each image info to map
        for (const artwork of resp.data.data) {

            if (artwork.images?.web?.url) {
                images["url"] = artwork.images.web.url;
            }
            if (artwork.description){
                images["description"] = artwork.description;
            }
        }
        return images; // returns map of image info
        */
    } catch (err) {
        console.error("ERROR getting artwork data");
        console.error(err);
        return []; // return empty map if it fails
    }
};
//getArtworks("death", 0, 10);

// Song API is working
async function getSongsByMood(tag) {
    let response = await fetch(
        `http://ws.audioscrobbler.com/2.0/?method=tag.gettoptracks&tag=${tag}&api_key=c434b6e9cd97b1fbadb8f6b9b3e964e3&format=json`
    );
    let data = await response.json();
    return data.tracks?.track || [];
}

export async function getOnePlayableSong(trackName, artistName) {
    const query = `${trackName} ${artistName}`;
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&limit=1&media=music&entity=musicTrack`;

    const raw = await fetch(url);
    const text = await raw.text();

    let data;
    try {
        data = JSON.parse(text);
    } catch (err) {
        console.error("iTunes returned non-JSON:", text);
        return null;
    }

    return data.results?.[0] || null;
}


// Route for testing /songs/:mood
app.get('/songs/:mood', async (req, res) => {
    let mood = req.params.mood;

    let songs = await getSongsByMood(mood);

    // lists first 5 results
    let output = `<h2>Top Songs for Mood: ${mood}</h2>`;
    for (let song of songs.slice(0, 5)) {
        output += `${song.name} by ${song.artist.name}<br>`;
    }
    output;

    res.send(output);
});

// Display artworks from database
app.get('/artworks', async (req, res) => {
    let [rows] = await pool.execute('SELECT * FROM artworks');
    res.render('artworks', { artworks: rows });
});

// Show selected artwork and songs from its mood
app.get('/artwork/:id', async (req, res) => {
    let [rows] = await pool.execute(
        'SELECT * FROM artworks WHERE artworkId = ?', [req.params.id]
    );
    
    let artwork = rows[0];
    let mood = artwork.mood;

    let songs = await getSongsByMood(mood);
    res.render('artwork-details', { artwork, songs });
});


app.post("/addToFavs", async (req, res) => {
    const artist = req.body.artist || "Unknown Artist";
    const title = req.body.title;
    const image_url = req.body.image_url;

    let sql = `INSERT INTO favorites
                (artist, title, image_url)
                VALUES (?, ?, ?)`;
    let sqlParams = [artist, title, image_url];
    const[rows] = await pool.query(sql, sqlParams);
    res.json({status: "ok"})
});

//routes

//Admin page
app.get('/admin', isAuthenticated, isAdmin, async (req, res) => {
    const search = req.query.search || '';
    const role = req.query.role || '';

    let sql = 'SELECT userId, email, role, username FROM users';
    let params = [];

    if (search) {
        sql += ' WHERE (email LIKE ? OR username LIKE ?)';
        params.push('%' + search + '%', '%' + search + '%');
    }

    if (role === 'admin' || role === 'user') {
        if (params.length > 0) {
            sql += ' AND role = ?';
        } else {
            sql += ' WHERE role = ?';
        }
        params.push(role);
    }

    const [users] = await pool.execute(sql, params);

    res.render('admin', {
        username: req.session.username,
        users
    });
});

// only logged in users can go into the favorites tab
app.get('/favorites', isAuthenticated, async (req, res) => {
    res.render('favorites', { username: req.session.username /*, favorites: rows */ });
});

// Home only for logged in users
app.get('/', isAuthenticated, (req, res) => {     
    res.render('home', { username: req.session.username });
});

app.get('/artworks', isAuthenticated, async (req, res) => {
    let [rows] = await pool.execute('SELECT * FROM artworks');
    res.render('artworks', { artworks: rows, userEmail: req.session.email });
});

//  delete user
app.post('/admin/users/:id/delete', isAuthenticated, isAdmin, async (req, res) => {
    const userId = req.params.id;
    await pool.execute('DELETE FROM users WHERE userId = ?', [userId]);
    res.redirect('/admin');
});

//  make user admin 
app.post('/admin/makeadmin', isAuthenticated, isAdmin, async (req, res) => {

    const userId = req.body.userId;
    await pool.execute('UPDATE users SET role = "admin" WHERE userId = ?', [userId]);
    res.redirect('/admin');
});

app.post('/admin/removeadmin', isAuthenticated, isAdmin, async (req, res) => {
    const userId = req.body.userId;
    await pool.execute('UPDATE users SET role = "user" WHERE userId = ?', [userId]);
    res.redirect('/admin');
});

//signup route
app.get('/signup', (req, res) => {
    res.render('signup', { error: null });
});

app.post('/signup', async (req, res) => {
    const { username, email, password } = req.body;

    try {
        const [existing] = await pool.execute(
            'SELECT * FROM users WHERE username = ? OR email = ?',
            [username, email]
        );

        if (existing.length > 0) {
            return res.render('signup', { error: 'Username or email already exists' });
        }

        const hashed = await bcrypt.hash(password, 10);

        await pool.execute(
            'INSERT INTO users (email, passwordHash, role, username) VALUES (?, ?, ?, ?)',
            [email, hashed, 'user', username]   // role 
        );

        res.redirect('/login');
    } catch (err) {
        console.error(err);
        res.render('signup', { error: 'Something went wrong, please try again.' });
    }
});

app.get('/search', async (req, res) => {
    let mood = req.query.mood;
    console.log(mood);
    if (mood.includes(' ')){
        return res.render('home.ejs');
    }
    //calling paintings API
    const artworksMatched = await getArtworks(mood, 0, 10);
    if (artworksMatched == null){
        return res.render('home.ejs');
    }

    //calling song API
    let songs = await getSongsByMood(mood);
    if (songs == null){
        return res.render('home.ejs');
    }

    // lists first 5 results
    let output = "";
    for (let song of songs.slice(0, 5)) {
        if (!song || !song.name || !song.artist || !song.artist.name) continue;
        output += `${song.name} by ${song.artist.name}<br>`;
    }

    //only going to play the first song because iTunes blocks spamming
    let firstSong = songs[0];
    if (!firstSong?.name || !firstSong.artist?.name){
        return res.render('home.ejs');
    }
    let songInfo = await getOnePlayableSong(firstSong.name, firstSong.artist.name);

    console.log(songInfo);

    res.render('results.ejs', {artworksMatched, mood, output, songInfo});
 });

 //Login route
 app.get('/login', (req, res) => {
    res.render('login', { error: null });
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    // Get user by email
    const [rows] = await pool.execute(
        'SELECT * FROM users WHERE email = ?',
        [email]
    );
    // No user found
    if (rows.length === 0) {
        return res.render('login', { error: 'Invalid email or password' });
    }
    const user = rows[0];

    // Compare password
    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
        return res.render('login', { error: 'Invalid email or password' });
    }

    // Save session info
    req.session.userId = user.userId;
    req.session.email = user.email;
    req.session.username = user.username;
    req.session.role = user.role;

    //  admin vs user
    if (user.role === 'admin') {
        return res.redirect('/admin');
    }

    return res.redirect('/');
});

app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error(err);
        }
        res.redirect('/login');
    });
});
//dbTest
app.get("/dbTest", async(req, res) => {
    try {
         const [rows] = await pool.query("SELECT CURDATE()");
         res.send(rows);
     } catch (err) {
         console.error("Database error:", err);
         res.status(500).send("Database error!");
     }
 });
 
 app.listen(3000, ()=>{
     console.log("Express server running")
 })
