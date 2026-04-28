import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import { updateProfileSchema } from "../validators/me.validators";
import { asyncHandler } from "../utils/async-handler";
import { getMe, syncMe, updateMe } from "../services/user.service";

export const meRouter = Router();

meRouter.use(authMiddleware);

meRouter.get("/", asyncHandler(async (req, res) => {
  res.json({ data: await getMe(req.user!.uid) });
}));

meRouter.post("/sync", asyncHandler(async (req, res) => {
  res.status(201).json({ data: await syncMe(req.user!) });
}));

meRouter.patch("/", validate({ body: updateProfileSchema }), asyncHandler(async (req, res) => {
  res.json({ data: await updateMe(req.user!.uid, req.body) });
}));
