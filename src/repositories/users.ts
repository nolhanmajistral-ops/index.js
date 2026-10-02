import { prisma } from "@/lib/db";

export function findUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email: email.toLowerCase() } });
}

export function findUserById(id: string) {
  return prisma.user.findUnique({ where: { id }, select: { id: true, email: true, name: true, onboardedAt: true, createdAt: true } });
}

export function createUser(data: { email: string; name: string; passwordHash: string }) {
  return prisma.user.create({ data: { ...data, email: data.email.toLowerCase() }, select: { id: true, email: true, name: true } });
}

export function markOnboarded(userId: string) {
  return prisma.user.update({ where: { id: userId }, data: { onboardedAt: new Date() } });
}

/** Suppression globale (NLPD) : cascade sur toutes les données de l'utilisateur. */
export function deleteUserCascade(userId: string) {
  return prisma.user.delete({ where: { id: userId } });
}
