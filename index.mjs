import express from 'express';
import mysql from 'mysql2/promise';
import axios from 'axios';
import fetch from 'node-fetch';

const app = express();

app.set('view engine', 'ejs');
app.use(express.static('public'));

//for Express to get values using POST method
app.use(express.urlencoded({extended:true}));

//setting up database connection pool
const pool = mysql.createPool({
    host: "qn66usrj1lwdk1cc.cbetxkdyhwsb.us-east-1.rds.amazonaws.com",
    user: "wio9z639w46xw6q8",
    password: "kxmxh2ebd9qx2b30",
    database: "f3orc0h59yrjbdbz",
    connectionLimit: 10,
    waitForConnections: true
});

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

// Route for testing /songs/:mood
// Example: "http://localhost:3000/songs/love"
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

//routes
app.get('/', async (req, res) => {     
    res.render('home.ejs');
});

app.get('/search', async (req, res) => {
    let mood = req.query.mood;
    console.log(mood);
    const artworksMatched = await getArtworks(mood, 0, 10);
    //res.json(artworksMatched);
    //console.log(artworksMatched);

    //song API
    let songs = await getSongsByMood(mood);

    // lists first 5 results
    let output = "";
    for (let song of songs.slice(0, 5)) {
        output += `${song.name} by ${song.artist.name}<br>`;
    }
    output;

    res.render('results.ejs', {artworksMatched, mood, output});
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