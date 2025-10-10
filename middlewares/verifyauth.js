const jwt = require("jsonwebtoken");
const User = require("../model/user.js");
const Admin = require("../model/Admin.js");
const ErrorHander = require("./errorhandler.js");

// Utility function to get token from request headers
function getToken(req) {
  const authHeader =
    req.header('Authorization') ||
    req.header('authorization') ||
    req.header('Authentication');

  if (!authHeader) return null;

  const parts = authHeader.split(' ');
  return parts.length === 2 ? parts[1] : parts[0];
}

// Middleware to check if token is expired
function isTokenExpired(req, res, next) {
  const token = getToken(req);

  if (!token) return next(new ErrorHander("No token provided", 403));

  const decodedToken = jwt.decode(token);
  if (decodedToken && decodedToken.exp) {
    const currentTime = Math.floor(Date.now() / 1000); // Convert milliseconds to seconds
    if (decodedToken.exp < currentTime) {
      return next(new ErrorHander("Wrong OTP or OTP has expired", 401));
    }
  }

  next(); // Token is valid or decoding failed
}

// Middleware to verify token and attach decoded info to req
function verifyToken(req, res, next) {
  const token = getToken(req);
  if (!token) {
    return res.status(403).send({ message: "No token provided" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: err.message });
    }
    req._id = decoded.id;
    req.decoded = decoded;
    next();
  });
}

// Middleware to check admin role
async function isadmin(req, res, next) {
  const token = getToken(req);
  if (!token) {
    return res.status(403).send({ message: "No token provided" });
  }

  jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: err.message });
    }

    req._id = decoded.id;
    const user = await Admin.findById(decoded.id);
    if (!user) {
      return next(new ErrorHander('Login to continue', 405));
    }
    if (user.role !== 'admin') {
      return next(new ErrorHander('Unauthorized', 401));
    }
    next();
  });
}

module.exports = { isadmin, verifyToken, isTokenExpired };
