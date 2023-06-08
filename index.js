const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const jwt = require("jsonwebtoken");
const port = process.env.PORT || 5000;

//middleware
app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.v6yry4e.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    client.connect();

    // collections

    const classesCollection = client.db("fllDB").collection("classes");
    const usersCollection = client.db("fllDB").collection("users");
    // APIs are started here

    // save user
    app.patch("/add-user", async (req, res) => {
      const body = req.body;
      console.log(body);
      const isAlreadyMember = await usersCollection.findOne({
        email: body.email,
      });
      if (isAlreadyMember) {
        return res.send(["Already a member"]);
      }
      const result = await usersCollection.insertOne(body);
      res.send(result);
    });
    //get jwt
    app.get("/jwt", (req, res) => {
      const email = req.query.email;
      console.log(email);
      const token = jwt.sign({ email }, process.env.JWT_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    //get instructors
    app.get("/instructor", async (req, res) => {
      const query = { role: "instructor" };
      const result = await usersCollection.find(query).toArray();
      res.send(result);
    });
    //get classes with limit and sorts
    app.get("/classes-limit", async (req, res) => {
      const query = {};
      const option = {
        sort: { bookedSeats: -1 },
      };
      const result = await classesCollection
        .find(query, option)
        .limit(6)
        .toArray();
      res.send(result);
    });

    //get all classes data
    app.get("/classes-all", async (req, res) => {
      const result = await classesCollection.find().toArray();
      res.send(result);
    });
    // APIs are ends here
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

//test route
app.get("/", (req, res) => {
  res.send([`Server is running at port ${port}`]);
});
app.listen(port, () => {
  console.log(`Server is started at port ${port}`);
});
