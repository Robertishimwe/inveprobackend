// src/types/express/index.d.ts

// Import the original Request type from express to ensure we're augmenting it correctly
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Request } from "express";

// Import the specific user type we defined for authenticated requests
// Adjust the path if your auth.middleware.ts file is located differently
import { AuthenticatedUser } from "../../middleware/auth.middleware"; // Use relative path

// Use declaration merging to add custom properties to the Express Request interface
declare global {
  namespace Express {
    // Extend the existing Request interface
    export interface Request {
      /**
       * Holds the authenticated user object, typically attached by authentication middleware.
       * Contains user details, roles, and calculated effective permissions.
       * Is undefined if the user is not authenticated.
       */
      user?: AuthenticatedUser;

      /**
       * Holds the identifier for the current tenant context, typically attached
       * by authentication or tenant identification middleware.
       * Is undefined if the tenant context could not be determined.
       */
      tenantId?: string;

      /**
       * Optional: If your validation middleware replaces req.body/req.query/req.params
       * with the validated DTO instance, you could add more specific types here,
       * although managing this globally can be complex. Often accessed via req.body/etc.
       * and relying on the controller's type hints is sufficient.
       *
       * Example (use with caution):
       * validatedBody?: any;
       * validatedQuery?: any;
       * validatedParams?: any;
       */
    }
  }
}

// Adding an empty export statement turns this file into a module,
// which is necessary for augmentation to work correctly in some setups.
export {};
