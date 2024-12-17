import fs from "fs";
import path from "path";
import cors from "cors";
import express from "express";
import cookieParser from "cookie-parser";
import session from "express-session";
import logger from "morgan";
import MongoStore from "connect-mongo";
import { MongoClient } from "mongodb";
import env from "./environments";
import mountPaymentsEndpoints from "./handlers/payments";
import mountUserEndpoints from "./handlers/users";

// We must import typedefs for ts-node-dev to pick them up when they change (even though tsc would supposedly
// have no problem here)
// https://stackoverflow.com/questions/65108033/property-user-does-not-exist-on-type-session-partialsessiondata#comment125163548_65381085
import "./types/session";

const mongoUri = `mongodb+srv://${env.mongo_user}:${encodeURIComponent(
  env.mongo_password
)}@${env.mongo_host}?ssl=true&sslValidate=true`;

const mongoClientOptions = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  authSource: "admin",
  ssl: true,
  sslValidate: true,
};

//
// I. Initialize and set up the express app and various middlewares and packages:
//

const app: express.Application = express();

// Log requests to the console in a compact format:
app.use(logger("dev"));

// Full log of all requests to /log/access.log:
app.use(
  logger("common", {
    stream: fs.createWriteStream(
      path.join(__dirname, "..", "log", "access.log"),
      { flags: "a" }
    ),
  })
);

// Enable response bodies to be sent as JSON:
app.use(express.json());

// Handle CORS:
const allowedOrigins = [env.frontend_url_one, env.frontend_url_two];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Access-Control-Allow-Origin",
    ],
    preflightContinue: false,
    optionsSuccessStatus: 204,
  })
);

// Handle cookies 🍪
app.use(cookieParser());

// Use sessions:
app.use(
  session({
    secret: env.session_secret,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: mongoUri,
      mongoOptions: mongoClientOptions,
      dbName: env.mongo_db_name,
      collectionName: "user_sessions",
    }),
  })
);

//
// II. Mount app endpoints:
//

// Payments endpoint under /payments:
const paymentsRouter = express.Router();
mountPaymentsEndpoints(paymentsRouter);
app.use("/payments", paymentsRouter);

// User endpoints (e.g signin, signout) under /user:
const userRouter = express.Router();
mountUserEndpoints(userRouter);
app.use("/user", userRouter);

// Hello World page to check everything works:
app.get("/", async (_, res) => {
  res.status(200).send({ message: "Hello, World!" });
});

// III. Boot up the app:

app.listen(8080, async () => {
  try {
    console.log("Connecting to MongoDB with URI:", mongoUri);
    const client = await MongoClient.connect(mongoUri, mongoClientOptions);
    const db = client.db(env.mongo_db_name);
    app.locals.orderCollection = db.collection("orders");
    app.locals.userCollection = db.collection("users");
    console.log("Connected to MongoDB on: ", mongoUri);
  } catch (err) {
    console.error("Connection to MongoDB failed: ", err);
  }

  console.log("App platform demo app - Backend listening on port 8000!");
  console.log(
    `CORS config: configured to respond to a frontend hosted on ${env.frontend_url_one} and on ${env.frontend_url_two}`
  );
});
