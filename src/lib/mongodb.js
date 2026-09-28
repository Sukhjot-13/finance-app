// app/lib/mongodb.js
import mongoose from "mongoose";

// The URI is read lazily inside dbConnect (never at import time) so that
// `next build` — which imports every route — succeeds without env vars
// configured. Any actual DB operation without MONGODB_URI throws the same
// clear error the old import-time check produced.
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function dbConnect() {
  const MONGODB_URI = process.env.MONGODB_URI;

  if (!MONGODB_URI) {
    throw new Error(
      "Please define the MONGODB_URI environment variable inside .env.local"
    );
  }

  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      maxPoolSize: 10, // Maintain up to 10 socket connections
      serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
      family: 4, // Use IPv4, skip trying IPv6
    };

    cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongoose) => {
      console.log("MongoDB connected successfully");
      return mongoose;
    }).catch((error) => {
      // Message only. Mongoose/server errors can echo the connection string
      // (which embeds the Atlas password) in their properties.
      console.error(
        "MongoDB connection error:",
        typeof error?.message === "string" ? error.message : "unknown error"
      );
      cached.promise = null; // Reset promise on error
      throw error;
    });
  }
  
  try {
    cached.conn = await cached.promise;
    return cached.conn;
  } catch (error) {
    cached.promise = null; // Reset promise on error
    throw error;
  }
}

export default dbConnect;
