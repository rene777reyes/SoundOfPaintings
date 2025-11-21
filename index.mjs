import express from 'express';
import mysql from 'mysql2/promise';
import axios from 'axios';

const app = express();

app.set('view engine', 'ejs');
app.use(express.static('public'));

//for Express to get values using POST method
app.use(express.urlencoded({extended:true}));

//setting up database connection pool
// Currently using Rene's database. We should change it
const pool = mysql.createPool({
    host: "q68u8b2buodpme2n.cbetxkdyhwsb.us-east-1.rds.amazonaws.com",
    user: "xl4jx4dujap92wk3",
    password: "p9wkm8o141l7i9z0",
    database: "q7umu6ct1r9qcxua",
    connectionLimit: 10,
    waitForConnections: true
});

//Paintings API is working 
const printOpenAccessResults = (keyword, skip, limit) => {
    const url = "https://openaccess-api.clevelandart.org/api/artworks"
    const params = {
            q: keyword,
            skip: skip,
            limit: limit,
            has_image: 1
        };

    const resp = axios(url, {params})
        .then((resp) => {
            for (const artwork of resp.data.data) {
                const tombstone = artwork.tombstone;
                const image = artwork.images.web.url;

                console.log(`${tombstone}\n${image}\n---`);
            }
        })
        .catch((e) => {
            console.log("ERROR getting artwork data");
            console.log(e);
        });
}

printOpenAccessResults("death", 0, 10);


//routes
app.get('/', async (req, res) => {     
    res.render('home.ejs');
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