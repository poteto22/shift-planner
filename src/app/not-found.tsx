import Link from "next/link";

export default function NotFound() {
  return (
    <div className="p-8 text-center">
      <h2 className="text-xl font-bold mb-2">ไม่พบหน้าที่ต้องการ (404)</h2>
      <Link href="/" className="btn text-sm">
        กลับหน้าหลัก
      </Link>
    </div>
  );
}

