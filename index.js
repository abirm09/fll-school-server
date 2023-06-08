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

//verify jwt
const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res
      .status(401)
      .send([{ error: true, message: "Un authorize user." }]);
  }
  const token = authorization.split(" ")[1];
  jwt.verify(token, process.env.JWT_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).send([{ error: true, message: "Access denied" }]);
    }
    req.decoded = decoded;
    next();
  });
};

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    client.connect();

    // collections

    const classesCollection = client.db("fllDB").collection("classes");
    const usersCollection = client.db("fllDB").collection("users");
    const selectedCollection = client.db("fllDB").collection("select");
    // APIs are started here

    // save user
    app.patch("/add-user", async (req, res) => {
      const body = req.body;
      const isAlreadyMember = await usersCollection.findOne({
        email: body.email,
      });
      if (isAlreadyMember) {
        return res.send(["Already a member"]);
      }
      const result = await usersCollection.insertOne(body);
      res.send(result);
    });
    //get user role
    app.get("/role", verifyJWT, async (req, res) => {
      const email = req.query.email;
      if (!email) {
        return res.send([""]);
      }
      const query = { email: email };
      const options = {
        projection: { _id: 0, role: 1 },
      };
      const result = await usersCollection.findOne(query, options);
      let userRole = "user";
      // console.log(result);
      if (result) {
        if (result.role === "instructor") {
          userRole = "instructor";
        } else if (result.role === "admin") {
          userRole = "admin";
        }
      }
      res.send(userRole);
    });
    //get jwt
    app.get("/jwt", (req, res) => {
      const email = req.query.email;
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
    //select course
    app.post("/select-item", verifyJWT, async (req, res) => {
      const body = req.body;
      if (req.decoded.email != body.studentEmail) {
        return res.send({ error: true, message: "Un authorized user." });
      }
      const result = await selectedCollection.insertOne(body);
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
