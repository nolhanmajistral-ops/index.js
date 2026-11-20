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

/**
 * Inscription contrôlée. Inscriptions ouvertes → création normale.
 * Inscriptions fermées → seul le tout premier compte (base vide) peut être créé : après une
 * nouvelle base, le propriétaire recrée son compte et les inscriptions se referment d'elles-mêmes.
 * Verrou transactionnel : deux inscriptions simultanées sur une base vide ne créent qu'un compte.
 * Renvoie null si l'inscription est refusée.
 */
export function createUserIfAllowed(data: { email: string; name: string; passwordHash: string }, registrationOpen: boolean) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('nolhan-os:register'))`;
    if (!registrationOpen && (await tx.user.count()) > 0) return null;
    return tx.user.create({ data: { ...data, email: data.email.toLowerCase() }, select: { id: true, email: true, name: true } });
  });
}

/** Le formulaire d'inscription est-il utilisable ? (ouvert, ou base encore vide) */
export async function isRegistrationAvailable(registrationOpen: boolean) {
  return registrationOpen || (await prisma.user.count()) === 0;
}

export function markOnboarded(userId: string) {
  return prisma.user.update({ where: { id: userId }, data: { onboardedAt: new Date() } });
}

/** Suppression globale (NLPD) : cascade sur toutes les données de l'utilisateur. */
export function deleteUserCascade(userId: string) {
  return prisma.user.delete({ where: { id: userId } });
}
