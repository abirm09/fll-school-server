const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const jwt = require("jsonwebtoken");
const port = process.env.PORT || 5000;
const stripe = require("stripe")(process.env.STRIPE_SECRET);
//middleware
app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
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
    return res.status(401).send({ error: true, message: "Un authorize user." });
  }
  const token = authorization.split(" ")[1];
  jwt.verify(token, process.env.JWT_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).send({ error: true, message: "Access denied" });
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
    const enrolledCollection = client.db("fllDB").collection("enrolled");
    // APIs are started here
    //get jwt
    app.get("/jwt", (req, res) => {
      const email = req.query.email;
      const token = jwt.sign({ email }, process.env.JWT_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
    });
    //middleware
    const verifyInstructor = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email };
      const result = await usersCollection.findOne(query);
      if (result.role !== "instructor") {
        return res.status(403).send({ error: true, message: "Access denied" });
      }
      next();
    };
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
      if (result) {
        if (result.role === "instructor") {
          userRole = "instructor";
        } else if (result.role === "admin") {
          userRole = "admin";
        }
      }
      res.send(userRole);
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
      const getEnrolledItems = await enrolledCollection
        .find({
          email: body.studentEmail,
        })
        .toArray();
      for (const item of getEnrolledItems) {
        if (item.classId === body.classId) {
          return res.send({ status: false, message: "Already enrolled" });
        }
      }
      const result = await selectedCollection.insertOne(body);
      res.send(result);
    });

    //get selected classes
    app.get("/selected-classes", verifyJWT, async (req, res) => {
      const email = req.query.email;
      if (req.decoded.email !== email) {
        return res
          .send(403)
          .send({ error: true, message: "Un authorize user." });
      }
      const query = { studentEmail: email };
      const result = await selectedCollection.find(query).toArray();
      res.send(result);
    });
    //delete selected items
    app.delete("/delete-selected-item", async (req, res) => {
      const { email, id } = req.query;
      const query = { _id: new ObjectId(id) };
      const result = await selectedCollection.deleteOne(query);
      res.send(result);
    });
    //payment intent
    app.post("/payment-intent", async (req, res) => {
      const id = req.query.id;
      const query = { _id: new ObjectId(id) };
      const option = {
        projection: { _id: 0, price: 1 },
      };
      const { price } = await selectedCollection.findOne(query, option);
      const amount = price * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({ clientSecret: paymentIntent.client_secret });
    });
    //get item by id
    app.get("/selected-item", async (req, res) => {
      const id = req.query.id;
      const query = { _id: new ObjectId(id) };
      const result = await selectedCollection.findOne(query);
      res.send(result);
    });
    // check if seat is available or not
    app.get("/class-available-or-not", async (req, res) => {
      const id = req.query.id;
      const query = { _id: new ObjectId(id) };
      const result = await classesCollection.findOne(query);
      const calculation = result.totalSeats - result.bookedSeats;
      if (calculation > 0 && calculation <= result.totalSeats) {
        return res.send({ status: true, message: "Class is available." });
      }
      return res.send({ status: false, message: "Class is not available." });
    });
    //update count on classes and add to enrolled classes
    app.post("/enrolled-classes", verifyJWT, async (req, res) => {
      const body = req.body;
      body.time = new Date();
      const selectedId = body.id;
      const deleteFromSelectItem = await selectedCollection.deleteOne({
        _id: new ObjectId(selectedId),
      });
      delete body.id;
      const query = { _id: new ObjectId(body.classId) };
      const option = {
        projection: { _id: 0, totalSeats: 1, bookedSeats: 1 },
      };
      const getPreviousData = await classesCollection.findOne(query, option);
      const calculation =
        getPreviousData.totalSeats - getPreviousData.bookedSeats;
      if (calculation > 0 && calculation <= getPreviousData.totalSeats) {
        const updatedBookedCount = getPreviousData.bookedSeats + 1;
        const updateDoc = {
          $set: {
            bookedSeats: updatedBookedCount,
          },
        };
        const updateBookedCount = await classesCollection.updateOne(
          query,
          updateDoc
        );
        const result = await enrolledCollection.insertOne(body);
        res.send({ result, updateBookedCount });
      }
    });
    //get enrolled classes
    app.get("/enrolled-classes", async (req, res) => {
      const email = req.query.email;
      const result = await enrolledCollection
        .find({ email }, { sort: { time: -1 } })
        .toArray();
      res.send(result);
    });

    //instructor
    // -------------------------
    //add new class
    app.post(
      "/add-new-class",
      verifyJWT,
      verifyInstructor,
      async (req, res) => {
        const body = req.body;
        body.bookedSeats = 0;
        body.status = "pending";
        console.log(body);
        const result = await classesCollection.insertOne(body);
        res.send(result);
      }
    );
    //get classes that a instructor have added
    app.get("/added-classes", verifyJWT, verifyInstructor, async (req, res) => {
      const email = req.decoded.email;
      const query = { instructorEmail: email };
      const result = await classesCollection.find(query).toArray();
      res.send(result);
    });
    //admin
    //approve a post
    app.post("/approve-a-class", async (req, res) => {
      const id = req.query.id;
      const query = { _id: new ObjectId(id) };
      console.log(id);
      const option = { $set: { status: "approved" } };
      const result = await classesCollection.updateOne(query, option);
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
