// src/modules/locations/location.routes.ts
import express from 'express';
import { locationController } from './location.controller';
import validateRequest from '@/middleware/validate.middleware';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { authMiddleware } from '@/middleware/auth.middleware';
import { ensureTenantContext } from '@/middleware/tenant.middleware';
import { checkPermissions } from '@/middleware/rbac.middleware';

const router = express.Router();

// Apply auth & tenant context to all location routes
router.use(authMiddleware);
router.use(ensureTenantContext);

// Define Location Routes
router.route('/')
    .post(
        checkPermissions(['location:create']), // Define this permission
        validateRequest(CreateLocationDto),
        locationController.createLocation
    )
    .get(
        checkPermissions(['location:read']), // Define this permission
        locationController.getLocations
    );

router.route('/:locationId')
    .get(
        checkPermissions(['location:read']),
        locationController.getLocation
    )
    .patch(
        checkPermissions(['location:update']), // Define this permission
        validateRequest(UpdateLocationDto),
        locationController.updateLocation
    )
    .delete(
        checkPermissions(['location:delete']), // Define this permission
        locationController.deleteLocation
    );

export default router;
