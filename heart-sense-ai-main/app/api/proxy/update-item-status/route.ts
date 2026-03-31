import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    return NextResponse.json({
      success: true,
      echoed: {
        session_id: body.session_id ?? null,
        category: body.category ?? null,
        item: body.item ?? null,
        status: body.status ?? null,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Item-status proxy failed",
        detail: error?.message || "Unexpected proxy failure",
      },
      { status: 500 },
    );
  }
}