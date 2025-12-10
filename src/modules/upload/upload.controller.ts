import { Request, Response } from 'express';
import catchAsync from '@/utils/catchAsync';
import httpStatus from 'http-status';
import ApiError from '@/utils/ApiError';

const uploadImage = catchAsync(async (req: Request, res: Response) => {
    if (!req.file) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'No file uploaded');
    }

    // Construct the public URL for the uploaded file
    // Assuming the static files are served from /uploads
    const fileUrl = `/uploads/${req.file.filename}`;

    res.status(httpStatus.CREATED).send({
        message: 'Image uploaded successfully',
        url: fileUrl,
        filename: req.file.filename,
        mimetype: req.file.mimetype,
        size: req.file.size
    });
});

export const uploadController = {
    uploadImage
};
