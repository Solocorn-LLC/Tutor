/**
 * POST /api/contact - Send contact form emails
 *
 * Sends contact form submissions to the solocorn.co email address
 * using SMTP via Namecheap/PrivateEmail.
 */

import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { withRateLimitPreset } from '@/lib/api/middleware'

/**
 * Escape user-supplied text before interpolating it into an HTML email body.
 * Prevents HTML/script injection into the recipient's inbox (stored-XSS-into-email)
 * and stops crafted values from breaking out of the template.
 */
function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Create SMTP transporter for Namecheap/PrivateEmail
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'mail.privateemail.com',
    port: parseInt(process.env.SMTP_PORT || '465'),
    secure: process.env.SMTP_SECURE !== 'false', // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
    },
  })
}

interface ContactFormData {
  type: 'contact' | 'tutor' | 'academy' | 'schools' | 'register' | 'chat'
  name: string
  email: string
  message?: string
  about?: string
  socialMedia?: string
  school?: string
  website?: string
}

export async function POST(req: NextRequest) {
  try {
    // Public, unauthenticated endpoint — throttle to prevent inbox flooding / abuse.
    const { response: rateLimited } = await withRateLimitPreset(req, 'contact')
    if (rateLimited) return rateLimited

    const body: ContactFormData = await req.json()

    // Validate required fields
    if (!body.name || !body.email) {
      return NextResponse.json({ error: 'Name and email are required' }, { status: 400 })
    }

    // Check if SMTP is configured
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.error('SMTP not configured. Email not sent.')
      // Return success anyway to not break UX, but log the error
      return NextResponse.json(
        {
          success: true,
          warning: 'Email configuration pending',
          message: 'Form submitted successfully. We will contact you soon!',
        },
        { status: 200 }
      )
    }

    const transporter = createTransporter()

    // Build email content based on form type
    let subject = ''
    let htmlContent = ''
    let textContent = ''

    switch (body.type) {
      case 'contact':
        subject = `Contact Form: Message from ${body.name}`
        htmlContent = `
          <h2>New Contact Form Submission</h2>
          <p><strong>Name:</strong> ${esc(body.name)}</p>
          <p><strong>Email:</strong> ${esc(body.email)}</p>
          <p><strong>Message:</strong></p>
          <p>${esc(body.message || 'No message provided')}</p>
        `
        textContent = `Name: ${body.name}\nEmail: ${body.email}\nMessage: ${body.message || 'No message provided'}`
        break

      case 'tutor':
        subject = `Tutor Signup: ${body.name}`
        htmlContent = `
          <h2>New Tutor Signup</h2>
          <p><strong>Name:</strong> ${esc(body.name)}</p>
          <p><strong>Email:</strong> ${esc(body.email)}</p>
          <p><strong>About:</strong></p>
          <p>${esc(body.about || 'Not provided')}</p>
          ${body.socialMedia ? `<p><strong>Social Media:</strong> ${esc(body.socialMedia)}</p>` : ''}
        `
        textContent = `Tutor Signup\nName: ${body.name}\nEmail: ${body.email}\nAbout: ${body.about || 'Not provided'}\nSocial Media: ${body.socialMedia || 'Not provided'}`
        break

      case 'academy':
        subject = `Academy Signup: ${body.name}`
        htmlContent = `
          <h2>New Academy Signup</h2>
          <p><strong>Name:</strong> ${esc(body.name)}</p>
          <p><strong>Email:</strong> ${esc(body.email)}</p>
          <p><strong>About:</strong></p>
          <p>${esc(body.about || 'Not provided')}</p>
          ${body.socialMedia ? `<p><strong>Social Media:</strong> ${esc(body.socialMedia)}</p>` : ''}
        `
        textContent = `Academy Signup\nName: ${body.name}\nEmail: ${body.email}\nAbout: ${body.about || 'Not provided'}\nSocial Media: ${body.socialMedia || 'Not provided'}`
        break

      case 'schools':
        subject = `School Partnership: ${body.school || body.name}`
        htmlContent = `
          <h2>New School Partnership Inquiry</h2>
          <p><strong>Contact Name:</strong> ${esc(body.name)}</p>
          <p><strong>School:</strong> ${esc(body.school || 'Not provided')}</p>
          <p><strong>Email:</strong> ${esc(body.email)}</p>
          ${body.website ? `<p><strong>Website:</strong> ${esc(body.website)}</p>` : ''}
          <p><strong>Message:</strong></p>
          <p>${esc(body.message || 'Not provided')}</p>
        `
        textContent = `School Partnership\nContact Name: ${body.name}\nSchool: ${body.school || 'Not provided'}\nEmail: ${body.email}\nWebsite: ${body.website || 'Not provided'}\nMessage: ${body.message || 'Not provided'}`
        break

      case 'register':
      case 'chat':
      default:
        subject = `Early Access Signup: ${body.name}`
        htmlContent = `
          <h2>New Early Access Signup</h2>
          <p><strong>Name:</strong> ${esc(body.name)}</p>
          <p><strong>Email:</strong> ${esc(body.email)}</p>
          ${body.message ? `<p><strong>Message:</strong></p><p>${esc(body.message)}</p>` : ''}
        `
        textContent = `Early Access Signup\nName: ${body.name}\nEmail: ${body.email}\nMessage: ${body.message || 'Not provided'}`
        break
    }

    // Send email
    await transporter.sendMail({
      from: `"Solocorn Website" <${process.env.SMTP_USER}>`,
      to: process.env.CONTACT_EMAIL || 'support@solocorn.co',
      replyTo: body.email,
      subject,
      text: textContent,
      html: htmlContent,
    })

    // Also send confirmation email to the user
    try {
      await transporter.sendMail({
        from: `"Solocorn" <${process.env.SMTP_USER}>`,
        to: body.email,
        subject: 'Thank you for contacting Solocorn!',
        text: `Hi ${body.name},\n\nThank you for reaching out to us! We've received your message and will get back to you soon.\n\nBest regards,\nThe Solocorn Team`,
        html: `
          <h2>Thank you for contacting Solocorn!</h2>
          <p>Hi ${esc(body.name)},</p>
          <p>Thank you for reaching out to us! We've received your message and will get back to you soon.</p>
          <br>
          <p>Best regards,<br>The Solocorn Team</p>
        `,
      })
    } catch (confirmError) {
      // Don't fail if confirmation email fails
      console.error('Confirmation email failed:', confirmError)
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Form submitted successfully! We will contact you soon.',
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Contact form error:', error)
    return NextResponse.json(
      {
        error: 'Failed to send message. Please try again later.',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
