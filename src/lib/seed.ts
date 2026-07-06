import { db } from '@/lib/db/dexie-db';
import { Role, SubscriptionType, SubscriptionStatus, PaymentMethod, Gender, MemberRole, SaleStatus } from '@/types/enums';

export async function seedDatabase() {
  const existingMembers = await db.members.toArray();
  if (existingMembers.length > 0) return;

  const now = new Date().toISOString();
  const today = now.split('T')[0];

  const sampleMembers: { firstName: string; lastName: string; gender: Gender; phone: string; email: string; birthDate: string; subType: SubscriptionType; role: MemberRole }[] = [
    { firstName: 'Ahmed', lastName: 'Benali', gender: Gender.MALE, phone: '0555123456', email: 'ahmed@email.com', birthDate: '1990-03-15', subType: SubscriptionType.MONTHLY, role: MemberRole.MEMBER },
    { firstName: 'Fatima', lastName: 'Ziani', gender: Gender.FEMALE, phone: '0666123456', email: 'fatima@email.com', birthDate: '1995-07-22', subType: SubscriptionType.QUARTERLY, role: MemberRole.MEMBER },
    { firstName: 'Karim', lastName: 'Hadj', gender: Gender.MALE, phone: '0777123456', email: 'karim@email.com', birthDate: '1988-11-08', subType: SubscriptionType.ANNUAL, role: MemberRole.COACH },
    { firstName: 'Sara', lastName: 'Mokhtar', gender: Gender.FEMALE, phone: '0555987654', email: 'sara@email.com', birthDate: '2000-01-30', subType: SubscriptionType.MONTHLY, role: MemberRole.MEMBER },
    { firstName: 'Yacine', lastName: 'Bouaziz', gender: Gender.MALE, phone: '0666987654', email: 'yacine@email.com', birthDate: '1992-06-14', subType: SubscriptionType.SEMESTER, role: MemberRole.MEMBER },
  ];

  for (const data of sampleMembers) {
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + ({ monthly: 1, quarterly: 3, semester: 6, annual: 12, custom: 1 } as any)[data.subType]!);
    const memberId = crypto.randomUUID();
    await db.members.add({
      id: memberId,
      firstName: data.firstName,
      lastName: data.lastName,
      gender: data.gender,
      phone: data.phone,
      email: data.email,
      birthDate: data.birthDate,
      role: data.role,
      memberNumber: `QLF${String(Math.floor(1000 + Math.random() * 9000))}`,
      address: 'Alger',
      subscription: {
        type: data.subType,
        status: SubscriptionStatus.ACTIVE,
        startDate: today,
        endDate: endDate.toISOString().split('T')[0],
        price: 5000,
        autoRenew: true,
      },
      createdAt: now,
      updatedAt: now,
    });

    await db.payments.add({
      memberId,
      amount: 5000,
      date: today,
      method: PaymentMethod.CASH,
      paymentFor: 'subscription',
      createdAt: now,
    });

    for (let d = 0; d < 10; d++) {
      const date = new Date();
      date.setDate(date.getDate() - d);
      if (Math.random() > 0.4) {
        const entryTime = new Date(date);
        entryTime.setHours(8 + Math.floor(Math.random() * 6), Math.floor(Math.random() * 60));
        await db.checkins.add({ memberId, timestamp: entryTime.toISOString(), type: 'entry' as any });
        const exitTime = new Date(entryTime);
        exitTime.setHours(exitTime.getHours() + 1 + Math.floor(Math.random() * 2));
        await db.checkins.add({ memberId, timestamp: exitTime.toISOString(), type: 'exit' as any });
      }
    }
  }

  const coach = (await db.members.toArray()).find(m => m.role === MemberRole.COACH);
  if (coach) {
    const groupId = crypto.randomUUID();
    await db.coachGroups.add({
      id: groupId,
      name: 'Cardio Training',
      coachId: coach.id!,
      createdAt: now,
    });
  }

  const catId = crypto.randomUUID();
  await db.productCategories.add({ id: catId, name: 'Nutrition', sortOrder: 0 });

  const products = [
    { name: 'Whey Protein 1kg', price: 4500, stock: 20 },
    { name: 'Shaker 500ml', price: 800, stock: 50 },
    { name: 'Barre protéinée', price: 250, stock: 100 },
    { name: 'T-shirt QLF', price: 1500, stock: 30 },
    { name: 'Serviette', price: 600, stock: 40 },
  ];

  for (const p of products) {
    await db.products.add({
      categoryId: catId,
      name: p.name,
      price: p.price,
      stock: p.stock,
      alertStock: 5,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
  }
}
