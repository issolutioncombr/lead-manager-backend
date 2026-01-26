import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  constructor(private readonly config: ConfigService) {}

  async sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
    const host = this.config.get<string>('SMTP_HOST');
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');
    const port = Number(this.config.get<string>('SMTP_PORT') ?? 587);
    const from = this.config.get<string>('MAIL_FROM') ?? 'no-reply@localhost';

    // Try to send with nodemailer if available, otherwise log the link
    if (host && user && pass) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const nodemailer: any = require('nodemailer');
        const transport = nodemailer.createTransport({
          host,
          port,
          secure: port === 465,
          auth: { user, pass }
        });
        await transport.sendMail({
          from,
          to,
          subject: 'Redefinição de senha',
          html: `
            <p>Recebemos uma solicitação para redefinir sua senha.</p>
            <p>Clique no botão abaixo (ou copie/cole o link no navegador):</p>
            <p><a href="${resetUrl}" style="background:#d4b26e;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;">Definir nova senha</a></p>
            <p>Se você não solicitou, ignore este e‑mail.</p>
          `
        });
        this.logger.log(`Reset de senha enviado para ${to}`);
        return;
      } catch (err) {
        this.logger.warn('Falha ao enviar e‑mail com nodemailer. Caindo para log.');
      }
    }

    this.logger.log(`Link de redefinição para ${to}: ${resetUrl}`);
  }
}

