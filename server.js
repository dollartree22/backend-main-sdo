require("dotenv").config();
const app = require('./app.js');
const port = process.env.PORT || 5000; // Railway automatically sets PORT
const cron = require('node-cron');

// Import the calculateDailyProfits function from plans.js
const { calculateDailyProfits } = require('./routes/plans');

// Handling Uncaught Exception
process.on("uncaughtException", (err) => {
  console.log(`Error: ${err.message}`);
  console.log(`Shutting down the server due to Uncaught Exception`);
  process.exit(1);
});

// Root test route
app.get('/', (req, res) => {
  res.json({ 
    message: 'SDO Backend API is working',
    service: 'Daily Profit Calculation System',
    status: 'Active'
  });
});

// ✅ Setup cron job for daily profit calculation (PRODUCTION)
console.log('⏰ Setting up production profit calculation system...');

// PRODUCTION: Run daily at midnight UTC (00:00)
cron.schedule('0 0 * * *', async () => {
    console.log('🚀 PRODUCTION: Starting daily profit calculation...');
    try {
        await calculateDailyProfits();
        console.log('✅ Production profit calculation completed at', new Date().toUTCString());
    } catch (error) {
        console.error('❌ Production calculation error:', error);
    }
});

// Health check endpoint for Railway
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'SDO Profit Calculator'
  });
});

// ✅ Save server instance
const server = app.listen(port, () => {
  console.log(`💰 SDO Production Server running on port: ${port}`);
  console.log(`📊 Daily profit system: ACTIVE`);
  console.log(`⏰ Next calculation: Daily at midnight UTC`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'production'}`);
});

// Unhandled Promise Rejection
process.on("unhandledRejection", (err) => {
  console.log(`Error: ${err}`);
  console.log(`Shutting down the server due to Unhandled Promise Rejection`);

  server.close(() => {
    process.exit(1);
  });
});