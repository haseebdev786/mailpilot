/**
 * Seeds a demo account plus sample records so the UI has something to show.
 * Run with: npm run db:seed
 */
async function main() {
  // `prisma db seed` already loads .env, but this also allows running the file directly.
  try {
    process.loadEnvFile?.(".env");
  } catch {
    // .env is optional when the variables are already exported.
  }

  const { prisma } = await import("@mailpilot/shared/db");
  const { ensureDemoAccount, DEMO_EMAIL, DEMO_PASSWORD } = await import("@mailpilot/shared/demo");

  const { user, workspace } = await ensureDemoAccount();

  await prisma.knowledgeBase.upsert({
    where: { workspaceId_name: { workspaceId: workspace.id, name: "MailPilot demo knowledge" } },
    update: {},
    create: {
      workspaceId: workspace.id,
      name: "MailPilot demo knowledge",
      description: "Sample knowledge base used by the reply assistant.",
      content: "We help small teams run thoughtful, permission-based email outreach.",
      aboutMe: "Demo Pilot runs a small studio focused on practical AI automation.",
      services: "Outreach setup, inbox automation, reply triage.",
      pastWork: "Helped 12 studios launch their first outbound sequence.",
      faqs: "Pricing starts with a free trial. Implementation takes about a week.",
      packages: "Starter, Growth, Studio",
      allowedDiscount: "10% for annual billing",
      timelines: "Kickoff within 3 business days",
      paymentTerms: "Net 14"
    }
  });

  const mailbox = await prisma.mailbox.upsert({
    where: { workspaceId_email: { workspaceId: workspace.id, email: DEMO_EMAIL } },
    update: {},
    create: {
      workspaceId: workspace.id,
      name: "Demo inbox",
      email: DEMO_EMAIL,
      provider: "SMTP_IMAP",
      fromName: "Demo Pilot",
      smtpHost: "smtp.example.com",
      smtpPort: 587,
      smtpSecure: false,
      smtpUsername: DEMO_EMAIL,
      imapHost: "imap.example.com",
      imapPort: 993,
      imapSecure: true,
      imapUsername: DEMO_EMAIL,
      dailySendLimit: 25,
      healthStatus: "UNKNOWN"
    }
  });

  const list = await prisma.contactList.upsert({
    where: { workspaceId_name: { workspaceId: workspace.id, name: "Demo prospects" } },
    update: {},
    create: {
      workspaceId: workspace.id,
      name: "Demo prospects",
      description: "Sample contacts to explore the product safely."
    }
  });

  const seedContacts = [
    { email: "sara.khan@northwind.example", firstName: "Sara", lastName: "Khan", company: "Northwind Studio", title: "Founder", status: "interested" },
    { email: "omar.farooq@brightlane.example", firstName: "Omar", lastName: "Farooq", company: "Brightlane", title: "Head of Growth", status: "replied" },
    { email: "lena.hoffman@signalcraft.example", firstName: "Lena", lastName: "Hoffman", company: "Signalcraft", title: "Operations Lead", status: "contacted" },
    { email: "david.reyes@paperkite.example", firstName: "David", lastName: "Reyes", company: "Paperkite", title: "Partner", status: "new" },
    { email: "mina.saleh@harborline.example", firstName: "Mina", lastName: "Saleh", company: "Harborline", title: "Marketing Manager", status: "followed_up" }
  ];

  const contacts = [];
  for (const contact of seedContacts) {
    contacts.push(
      await prisma.contact.upsert({
        where: { workspaceId_email: { workspaceId: workspace.id, email: contact.email } },
        update: { lists: { connect: { id: list.id } } },
        create: {
          workspaceId: workspace.id,
          createdById: user.id,
          source: "demo-seed",
          ...contact,
          lists: { connect: { id: list.id } }
        }
      })
    );
  }

  let campaign = await prisma.campaign.findFirst({
    where: { workspaceId: workspace.id, name: "Demo outreach · Q4" }
  });

  if (!campaign) {
    campaign = await prisma.campaign.create({
      data: {
        workspaceId: workspace.id,
        createdById: user.id,
        mailboxId: mailbox.id,
        name: "Demo outreach · Q4",
        description: "A sample campaign you can edit, pause, or delete safely.",
        businessDescription: "MailPilot demo workspace for trying the product end to end.",
        services: "AI-assisted outreach and reply triage",
        offer: "A free 15-minute workflow review",
        tone: "Friendly, concise, and specific",
        cta: "Would a short call next week be useful?",
        status: "DRAFT",
        dailySendLimit: 25,
        lists: { connect: { id: list.id } },
        recipients: { create: contacts.map((contact) => ({ contactId: contact.id })) },
        steps: {
          create: [
            {
              position: 0,
              type: "EMAIL",
              subject: "Quick question, {{firstName}}",
              templateBody:
                "Hi {{firstName}},\n\nI came across {{company}} and liked how focused the work is. We help teams like yours keep outreach personal without spending hours in the inbox.\n\nWould a short call next week be useful?\n\n— Demo",
              delayHours: 0
            },
            {
              position: 1,
              type: "EMAIL",
              subject: "Following up on {{company}}",
              templateBody:
                "Hi {{firstName}},\n\nJust floating this back up in case it slipped past. Happy to share a short example of how another studio set this up.\n\n— Demo",
              delayHours: 72
            }
          ]
        }
      }
    });
  }

  let thread = await prisma.thread.findFirst({
    where: { workspaceId: workspace.id, subject: "Re: Quick question, Sara" }
  });

  if (!thread) {
    const conversation = await prisma.conversation.create({
      data: { workspaceId: workspace.id, title: "Sara Khan · Northwind Studio" }
    });

    thread = await prisma.thread.create({
      data: {
        workspaceId: workspace.id,
        conversationId: conversation.id,
        mailboxId: mailbox.id,
        contactId: contacts[0].id,
        subject: "Re: Quick question, Sara",
        snippet: "This sounds relevant. Can you share pricing and a couple of examples?",
        status: "OPEN",
        needsAttention: true,
        lastMessageAt: new Date()
      }
    });

    const outbound = await prisma.emailMessage.create({
      data: {
        workspaceId: workspace.id,
        mailboxId: mailbox.id,
        campaignId: campaign.id,
        contactId: contacts[0].id,
        threadId: thread.id,
        direction: "OUTBOUND",
        status: "SENT",
        messageId: "<demo-outbound@sara.northwind.example>",
        fromEmail: DEMO_EMAIL,
        toEmail: contacts[0].email,
        subject: "Quick question, Sara",
        bodyText:
          "Hi Sara,\n\nI came across Northwind Studio and liked how focused the work is. We help teams like yours keep outreach personal without spending hours in the inbox.\n\nWould a short call next week be useful?\n\n— Demo",
        sentAt: new Date(Date.now() - 1000 * 60 * 60 * 26)
      }
    });

    const inbound = await prisma.emailMessage.create({
      data: {
        workspaceId: workspace.id,
        mailboxId: mailbox.id,
        contactId: contacts[0].id,
        threadId: thread.id,
        direction: "INBOUND",
        status: "REPLIED",
        messageId: "<demo-inbound@sara.northwind.example>",
        inReplyTo: outbound.messageId ?? undefined,
        fromEmail: contacts[0].email,
        toEmail: DEMO_EMAIL,
        subject: "Re: Quick question, Sara",
        bodyText: "This sounds relevant. Can you share pricing and a couple of examples?",
        sentAt: new Date(Date.now() - 1000 * 60 * 60 * 3)
      }
    });

    await prisma.reply.create({
      data: {
        workspaceId: workspace.id,
        threadId: thread.id,
        emailMessageId: inbound.id,
        contactId: contacts[0].id,
        classification: "ASKING_PRICE",
        sentiment: "positive",
        summary: "Sara is interested and wants pricing plus examples.",
        aiDraft:
          "Hi Sara,\n\nThanks for getting back to me. Plans start with a free trial, and the Starter package is $99/month for one mailbox. I have attached two short examples of similar studios.\n\nWould Thursday at 3pm work for a quick call?\n\n— Demo",
        aiConfidence: 0.86,
        needsAttention: true
      }
    });

    await prisma.notification.createMany({
      data: [
        {
          workspaceId: workspace.id,
          type: "INTERESTED_LEAD",
          title: "Sara Khan is interested",
          body: "She replied asking for pricing and examples.",
          entityType: "Thread",
          entityId: thread.id
        },
        {
          workspaceId: workspace.id,
          type: "NEEDS_ATTENTION",
          title: "One reply needs review",
          body: "A drafted reply is waiting for your approval in the inbox."
        }
      ]
    });

    const existingDeal = await prisma.deal.findFirst({
      where: { workspaceId: workspace.id, name: "Northwind Studio · workflow review" }
    });

    if (!existingDeal) {
      await prisma.deal.create({
        data: {
          workspaceId: workspace.id,
          contactId: contacts[0].id,
          campaignId: campaign.id,
          name: "Northwind Studio · workflow review",
          stage: "QUALIFIED",
          value: "4500.00",
          currency: "USD",
          notes: "Demo deal created by the seed script."
        }
      });
    }

    await prisma.activityLog.createMany({
      data: [
        { workspaceId: workspace.id, actorId: user.id, type: "CAMPAIGN_CREATED", entityType: "Campaign", entityId: campaign.id },
        { workspaceId: workspace.id, actorId: user.id, type: "REPLY_RECEIVED", entityType: "Thread", entityId: thread.id }
      ]
    });
  }

  console.log("\nDemo workspace ready:\n");
  console.log(`  email:    ${DEMO_EMAIL}`);
  console.log(`  password: ${DEMO_PASSWORD}`);
  console.log(`  workspace: ${workspace.name}\n`);
  console.log("You can also use the “Use demo account” button on the login page.\n");

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
