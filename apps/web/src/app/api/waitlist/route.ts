import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { name, email, phone, locale } = body as Record<string, string>

  if (!name?.trim() || !email?.trim() || !phone?.trim()) {
    return NextResponse.json({ error: 'name, email and phone are required' }, { status: 400 })
  }

  const apiUrl = process.env.API_INTERNAL_URL
  const secret = process.env.INTERNAL_API_SECRET

  if (!apiUrl || !secret) {
    console.error('API_INTERNAL_URL or INTERNAL_API_SECRET not configured')
    return NextResponse.json({ error: 'Service unavailable' }, { status: 500 })
  }

  try {
    const upstream = await fetch(`${apiUrl}/api/v1/marketing/waitlist`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${secret}`,
        'x-internal-secret': secret,
      },
      body: JSON.stringify({ name: name.trim(), email: email.trim(), phone: phone.trim(), locale: locale ?? 'en' }),
    })

    const data = await upstream.json()
    return NextResponse.json(data, { status: upstream.status })
  } catch (err) {
    console.error('Waitlist proxy error:', err)
    return NextResponse.json({ error: 'Service unavailable' }, { status: 500 })
  }
}
