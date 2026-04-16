const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function fix() {
  await prisma.paymentTransaction.updateMany({ where: { paymentId: 6 }, data: { paymentId: 5 } });
  await prisma.payment.update({ where: { id: 5 }, data: { paidAmount: 7000, status: 'partial' } });
  await prisma.payment.delete({ where: { id: 6 } });
  console.log('تم الدمج بنجاح!');
  await prisma.();
}
fix();
