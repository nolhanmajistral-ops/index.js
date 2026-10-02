// Variables d'environnement de test : base dédiée, clés générées pour les tests uniquement.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/nolhan_os_test?schema=public";
process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-1234";
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
process.env.APP_URL = "http://localhost:3000";
