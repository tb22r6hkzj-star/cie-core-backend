import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import multer from 'multer';

const app = express();

// ===== Middleware =====
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Multer (keeps file uploads in memory)
const upload = multer({ storage: multer.memoryStorage() });

// ===== Routes =====

// Test route
app.get('/', (req, res) => {
  res.json({ message: 'CIE Core Backend is running.' });
});

// Health check for Render monitoring
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ===== Ghost Mannequin TRANSFORM route =====
app.post('/api/images/transform', upload.single('image'), async (req, res) => {
  try {
    // No file uploaded
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file uploaded.',
      });
    }

    // Read the prompt sent from Famous frontend
    const prompt = req.body.prompt || 'ghost mannequin';

    // TEMPORARY: Working image placeholder
    const fakeTransformedImage =
      'https://images.pexels.com/photos/767116/pexels-photo-767116.jpeg';

    // Send back a real valid URL
    return res.json({
      success: true,
      ghostImageUrl: fakeTransformedImage,
      prompt,
    });

  } catch (error) {
    console.error('Transform Error →', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to transform image (server error).',
    });
  }
});

// ===== Start Server =====
const port = process.env.PORT || 4000;
const server = app.listen(port, () => {
  console.log(`🚀 CIE Core Backend listening on port ${port}`);
});

// Graceful shutdown
const shutdown = async (signal) => {
  console.log(`Received ${signal}. Shutting down gracefully...`);
  server.close(() => {
    console.log('HTTP server closed. Exiting process.');
    process.exit(0);
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
