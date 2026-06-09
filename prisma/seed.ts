import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const passwordHash = await bcrypt.hash('password123', 10)

  const admin = await prisma.user.upsert({
    where: { email: 'admin@qa-hub.local' },
    update: {},
    create: {
      email: 'admin@qa-hub.local',
      name: 'Admin User',
      passwordHash,
      role: 'ADMIN',
    },
  })

  const qa = await prisma.user.upsert({
    where: { email: 'qa@qa-hub.local' },
    update: {},
    create: {
      email: 'qa@qa-hub.local',
      name: 'QA Engineer',
      passwordHash,
      role: 'QA',
    },
  })

  const project = await prisma.project.upsert({
    where: { id: 'seed-project-main' },
    update: {},
    create: {
      id: 'seed-project-main',
      name: 'Main QA Project',
      description: 'Default project for QA test cases',
      status: 'ACTIVE',
    },
  })

  const suite = await prisma.testSuite.upsert({
    where: { id: 'seed-suite-auth' },
    update: {},
    create: {
      id: 'seed-suite-auth',
      name: 'Authentication',
      orderIndex: 0,
      projectId: project.id,
    },
  })

  await prisma.testCase.upsert({
    where: { tcId: 'TC-001' },
    update: {},
    create: {
      tcId: 'TC-001',
      title: 'Login with valid credentials',
      precondition: 'User exists in the system',
      steps: [
        { order: 1, action: 'Navigate to /login', testData: '', expectedStepResult: 'Login page shown' },
        { order: 2, action: 'Enter email and password', testData: 'email: qa@qa-hub.local | password: password123', expectedStepResult: '' },
        { order: 3, action: 'Click Login button', testData: '', expectedStepResult: 'Redirected to dashboard' },
      ],
      expectedResult: 'User is logged in and redirected to dashboard',
      priority: 'CRITICAL',
      type: 'FUNCTIONAL',
      scenarioType: 'POSITIVE',
      suiteId: suite.id,
      authorId: qa.id,
    },
  })

  console.log('Seed completed', { admin: admin.email, qa: qa.email })
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
