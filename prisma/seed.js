"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcrypt = __importStar(require("bcrypt"));
const prisma = new client_1.PrismaClient();
async function main() {
    const password = await bcrypt.hash('admin123', 10);
    const admin = await prisma.user.upsert({
        where: { email: 'admin@clinicayance.com' },
        update: {},
        create: {
            email: 'admin@clinicayance.com',
            password,
            name: 'Administrador',
            role: 'admin'
        }
    });
    const client = await prisma.client.create({
        data: {
            name: 'Maria Souza',
            email: 'maria.souza@example.com',
            phone: '+55 11 99999-0001',
            source: 'Instagram',
            tags: ['botox', 'vip'],
            status: client_1.ClientStatus.ACTIVE,
            score: 85,
            notes: 'Cliente interessada em procedimentos faciais.'
        }
    });
    const lead = await prisma.lead.create({
        data: {
            name: 'Maria Souza',
            email: 'maria.souza@example.com',
            contact: '+55 11 99999-0001',
            source: 'Instagram',
            notes: 'Lead capturado via campanha Outubro Rosa.',
            score: 70,
            stage: client_1.LeadStage.RETORNOU_CONTATO
        }
    });
    const appointment = await prisma.appointment.create({
        data: {
            leadId: lead.id,
            meetLink: 'https://meet.google.com/mock-link',
            start: new Date(),
            end: new Date(Date.now() + 60 * 60 * 1000),
            status: client_1.AppointmentStatus.COMPLETED
        }
    });
    await prisma.funnelEvent.createMany({
        data: [
            {
                clientId: client.id,
                type: 'lead_created',
                meta: { leadId: lead.id, source: 'Instagram' }
            },
            {
                clientId: client.id,
                type: 'appointment_booked',
                meta: { appointmentId: appointment.id }
            }
        ]
    });
    const campaign = await prisma.campaign.create({
        data: {
            name: 'Campanha Bienestar',
            channel: 'WhatsApp',
            message: 'Oferta exclusiva de pacotes faciais para clientes recorrentes.',
            status: client_1.CampaignStatus.SCHEDULED,
            scheduledAt: new Date()
        }
    });
    await prisma.campaignLog.create({
        data: {
            campaignId: campaign.id,
            message: 'Campanha criada pelo seed inicial.'
        }
    });
    console.log(`Seed concluido. Usuario administrador: ${admin.email} / senha: admin123`);
}
main()
    .catch((e) => {
    console.error(e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=seed.js.map
