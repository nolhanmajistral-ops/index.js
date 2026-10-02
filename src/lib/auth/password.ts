import bcrypt from "bcryptjs";

const COST = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// Hash factice pour un temps de réponse constant quand l'utilisateur n'existe pas.
export const DUMMY_HASH = "$2b$12$k6FyESAouYIHI/YU6ZihBOlvAK6HXeNGvgGl/HfQjuX4PxoIdqVPq";
