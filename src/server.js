import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import multer from 'multer';

const app = express();

// ===== Middleware =====
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Multer for handling image uploads (keeps file in memory)
const upload = multer({ storage: multer.memoryStorage() });

// ===== Routes =====

// Test route
app.get('/', (req, res) => {
  res.json({ message: 'CIE Core Backend is running.' });
});

// Health route for Render auto-monitoring
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Image transform route (Famous → Backend → AI processing)
// EXPECTS:
// - image: uploaded file
// - prompt: string
app.post('/api/images/transform', upload.single('image'), async (req, res) => {
  try {
    // No image upload?
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file uploaded.',
      });
    }

    // The prompt that Famous frontend sends
    const prompt = req.body.prompt || 'ghost mannequin';

    // TODO — replace with real AI transform call
    // For now return a placeholder image so the pipeline works
    const fakeTransformedImage = 'https://via.placeholder.com/768x1024.png?text=Ghost+Mock';

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

// ===== Server Start =====
const port = process.env.PORT || 4000;

const server = app.listen(port, () => {
  console.log(`🚀 CIE Core Backend listening on port ${port}`);
});

// ===== Graceful Shutdown =====
const shutdown = async (signal) => {
  console.log(`Received ${signal}. Shutting down gracefully...`);

  server.close(() => {
    console.log('HTTP server closed. Exiting process.');
    process.exit(0);
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
