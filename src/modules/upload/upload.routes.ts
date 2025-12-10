import express from 'express';
import { upload } from './upload.middleware';
import { uploadController } from './upload.controller';
import { authMiddleware } from '@/middleware/auth.middleware';

const router = express.Router();

// Route for uploading a single image
router.post('/', authMiddleware, upload.single('image'), uploadController.uploadImage);

export default router;
