import "dotenv/config";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

async function testEmail() {
  try {
    console.log("Testing Resend email service...");

    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_FROM || "Velora <onboarding@resend.dev>",
      to: ["delivered@resend.dev"],
      subject: "Velora Email Test",
      html: `
        <div style="font-family: Arial, sans-serif;">
          <h2>Velora Email Service</h2>
          <p>Resend email service is working successfully.</p>
          <p>This is a test email.</p>
        </div>
      `,
    });

    if (error) {
      console.error("❌ Resend Error:");
      console.error(error);
      return;
    }

    console.log("✅ Email sent successfully!");
    console.log("Email ID:", data?.id);
  } catch (error) {
    console.error("❌ Unexpected Error:");
    console.error(error);
  }
}

testEmail();