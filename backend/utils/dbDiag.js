const dns = require('dns');

/**
 * Parses connection string to extract targeted database name and print it.
 */
const logTargetDatabase = (uri) => {
  if (!uri) return;
  try {
    const protocolMatch = uri.match(/^mongodb(?:\+srv)?:\/\//);
    if (protocolMatch) {
      const remaining = uri.slice(protocolMatch[0].length);
      const slashIndex = remaining.indexOf('/');
      if (slashIndex !== -1) {
        const afterSlash = remaining.slice(slashIndex + 1);
        const questionMarkIndex = afterSlash.indexOf('?');
        const dbName = questionMarkIndex !== -1 ? afterSlash.slice(0, questionMarkIndex) : afterSlash;
        console.log(`ℹ️  Target database name from MONGODB_URI: "${dbName || 'default'}"`);
      } else {
        console.log(`ℹ️  Target database name from MONGODB_URI: "default"`);
      }
    }
  } catch (e) {
    // Ignore logging failures
  }
};

/**
 * Checks if the password contains unencoded special characters.
 */
const checkPasswordEncoding = (uri) => {
  if (!uri) return;
  try {
    const protocolMatch = uri.match(/^mongodb(?:\+srv)?:\/\//);
    if (protocolMatch) {
      const remaining = uri.slice(protocolMatch[0].length);
      const lastAtIndex = remaining.lastIndexOf('@');
      if (lastAtIndex !== -1) {
        const credentials = remaining.slice(0, lastAtIndex);
        const colonIndex = credentials.indexOf(':');
        if (colonIndex !== -1) {
          const password = credentials.slice(colonIndex + 1);
          // Special characters that must be URL encoded in connection strings
          const unencodedPattern = /[:/?#\[\]@!$&'()*+,;=]/;
          if (unencodedPattern.test(password)) {
            console.error('⚠️  WARNING: Your MONGODB_URI password contains unencoded special characters.');
            console.error('👉 If your password contains special characters (like @, :, /, ?, #, etc.), they MUST be URL-encoded (e.g. @ becomes %40).\n');
          }
        }
      }
    }
  } catch (e) {
    // Ignore warnings check error
  }
};

/**
 * Analyzes MongoDB connection errors and prints user-friendly diagnostic logs.
 */
const analyzeMongoError = (error) => {
  const uri = process.env.MONGODB_URI || '';
  const isAtlas = uri.includes('.mongodb.net');
  
  console.error('\n--- 🔍 MongoDB Connection Diagnostics ---');
  console.error('Exact Error Stack Trace:');
  console.error(error.stack || error);
  console.error('---------------------------------------\n');

  // 1. Invalid URI Check
  if (!uri) {
    console.error('❌ Diagnostic Result: INVALID URI');
    console.error('👉 The MONGODB_URI environment variable is missing or empty in your backend .env file.\n');
    return;
  }
  if (!uri.startsWith('mongodb://') && !uri.startsWith('mongodb+srv://')) {
    console.error('❌ Diagnostic Result: INVALID URI');
    console.error('👉 The MONGODB_URI scheme must start with "mongodb://" or "mongodb+srv://".\n');
    return;
  }

  // Check password encoding warnings
  checkPasswordEncoding(uri);

  const errorStr = (error.message || '') + ' ' + (error.stack || '') + ' ' + JSON.stringify(error);

  // 2. DNS Failure Check
  if (errorStr.includes('ENOTFOUND') || errorStr.includes('EAI_AGAIN') || errorStr.includes('getaddrinfo')) {
    console.error('❌ Diagnostic Result: DNS FAILURE');
    console.error('👉 The server failed to resolve the database domain name.');
    console.error('👉 Please check your internet connection, verify that the host name in MONGODB_URI is spelled correctly, and ensure your local DNS server is reachable.\n');
    return;
  }

  // 3. Authentication Failed Check
  if (
    error.code === 8000 || 
    errorStr.toLowerCase().includes('auth') || 
    errorStr.toLowerCase().includes('bad credentials') || 
    errorStr.toLowerCase().includes('authentication failed') ||
    errorStr.toLowerCase().includes('authfailed')
  ) {
    console.error('❌ Diagnostic Result: AUTHENTICATION FAILED');
    console.error('👉 The username or password in your MONGODB_URI is incorrect.');
    console.error('👉 Please double check that the user exists on your MongoDB Atlas cluster, has readWrite permissions, and the credentials in .env are correct.\n');
    return;
  }

  // 4. IP Not Whitelisted Check
  if (
    errorStr.toLowerCase().includes('whitelist') || 
    errorStr.includes('IP address') ||
    error.name === 'MongooseServerSelectionError' ||
    error.name === 'MongoServerSelectionError' ||
    errorStr.includes('Server selection timed out')
  ) {
    if (isAtlas) {
      console.error('❌ Diagnostic Result: IP NOT WHITELISTED (or connection timed out)');
      console.error('👉 MongoDB Atlas is blocking connection from this IP address.');
      console.error('👉 Action required in MongoDB Atlas settings:');
      console.error('   1. Log in to your MongoDB Atlas dashboard (https://cloud.mongodb.com/).');
      console.error('   2. Navigate to Network Access (under the Security tab in the left sidebar).');
      console.error('   3. Click "+ Add IP Address".');
      console.error('   4. Choose either:');
      console.error('      - "Add Current IP Address" to authorize your local machine\'s IP.');
      console.error('      - "Allow Access from Anywhere" (0.0.0.0/0) for general development access.');
      console.error('   5. Click Confirm and wait for the status to change from "Pending" to "Active".\n');
      return;
    }
  }

  // 5. Cluster Unavailable Check
  if (
    errorStr.includes('ECONNREFUSED') || 
    errorStr.includes('ECONNRESET') || 
    errorStr.includes('ENETUNREACH') || 
    errorStr.includes('ETIMEDOUT')
  ) {
    console.error('❌ Diagnostic Result: CLUSTER UNAVAILABLE');
    console.error('👉 Unable to establish connection to the database host (Connection refused, reset, or timed out).');
    console.error('👉 This could indicate the cluster is paused, terminating, or there is a local firewall/network block.\n');
    return;
  }

  // General fallback
  console.error('❌ Diagnostic Result: UNKNOWN CONNECTION FAILURE');
  console.error('👉 Could not determine the exact cause. Please verify internet connectivity, URI syntax, and Atlas dashboard alerts.\n');
};

module.exports = {
  logTargetDatabase,
  checkPasswordEncoding,
  analyzeMongoError
};
