const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const jwt = require("jsonwebtoken");
const port = process.env.PORT || 5000;

//middleware
app.use(cors());
app.use(express.json());

//test route
app.get("/", (req, res) => {
  res.send([`Server is running at port ${port}`]);
});
app.listen(port, () => {
  console.log(`Server is started at port ${port}`);
});
