import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router";
import { Download, ChevronLeft, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { verifyCertificate } from "@/shared/lib/api";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { toast } from "sonner";

interface CertificateData {
  id: string;
  student_id: string;
  course_id: string;
  verification_code: string;
  issued_at: string;
  profiles?: { name: string; email: string };
  courses?: { title: string };
}

export function CertificateView() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [cert, setCert] = useState<CertificateData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  
  const certificateRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function fetchCert() {
      if (!code) return;
      setLoading(true);
      try {
        const { data, error: fetchErr } = await verifyCertificate(code);
        if (fetchErr) {
          setError(fetchErr);
        } else if (data) {
          setCert(data as CertificateData);
        } else {
          setError("Certificate not found");
        }
      } catch (err: any) {
        setError(err.message || "Failed to load certificate");
      }
      setLoading(false);
    }
    fetchCert();
  }, [code]);

  const handleDownloadPDF = async () => {
    if (!certificateRef.current || !cert) return;
    
    setDownloading(true);
    toast.loading("Generating PDF...", { id: "pdf-toast" });
    
    try {
      const canvas = await html2canvas(certificateRef.current, {
        scale: 3, // High quality
        useCORS: true,
        backgroundColor: "#ffffff",
      });
      
      const imgData = canvas.toDataURL("image/jpeg", 1.0);
      
      // A4 Landscape dimensions in mm: 297 x 210
      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4",
      });
      
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      // Calculate aspect ratio to fit image inside PDF
      const imgProps = pdf.getImageProperties(imgData);
      const imgRatio = imgProps.width / imgProps.height;
      const pdfRatio = pdfWidth / pdfHeight;
      
      let finalWidth = pdfWidth;
      let finalHeight = pdfHeight;
      
      if (imgRatio > pdfRatio) {
        finalHeight = pdfWidth / imgRatio;
      } else {
        finalWidth = pdfHeight * imgRatio;
      }
      
      // Center the image
      const x = (pdfWidth - finalWidth) / 2;
      const y = (pdfHeight - finalHeight) / 2;
      
      pdf.addImage(imgData, "JPEG", x, y, finalWidth, finalHeight);
      
      const fileName = `${cert.profiles?.name || "Student"}_Certificate_${cert.courses?.title?.replace(/\s+/g, '_') || "Course"}.pdf`;
      pdf.save(fileName);
      
      toast.success("PDF Downloaded successfully", { id: "pdf-toast" });
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate PDF", { id: "pdf-toast" });
    }
    setDownloading(false);
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--gold)]" />
      </div>
    );
  }

  if (error || !cert) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <AlertCircle className="w-12 h-12 text-red-500 opacity-60" />
        <h2 className="text-xl font-semibold">Verification Failed</h2>
        <p className="text-muted-foreground">{error || "Certificate not found"}</p>
        <Button variant="outline" className="gap-2" onClick={() => navigate(-1)}>
          <ChevronLeft className="w-4 h-4" /> Back
        </Button>
      </div>
    );
  }

  const studentName = cert.profiles?.name || "Student Name";
  const courseTitle = cert.courses?.title || "Course Title";
  const issueDate = cert.issued_at ? new Date(cert.issued_at).toLocaleDateString() : new Date().toLocaleDateString();

  return (
    <div className="min-h-screen bg-muted/20 flex flex-col items-center py-10 px-4">
      <div className="w-full max-w-[1000px] flex justify-between items-center mb-6">
        <Button variant="outline" className="gap-2" onClick={() => navigate(-1)}>
          <ChevronLeft className="w-4 h-4" /> Back
        </Button>
        <Button onClick={handleDownloadPDF} disabled={downloading} className="gap-2 bg-[var(--gold)] text-[#1A1A1A] hover:bg-[#b09340]">
          {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Download PDF
        </Button>
      </div>

      {/* Certificate Container */}
      <div className="w-full max-w-[1000px] overflow-x-auto pb-8 flex justify-center">
        {/* Certificate rendering area. Pure HTML/CSS recreation of the template */}
        <div 
          ref={certificateRef}
          className="relative shadow-2xl bg-[#faf9f6] shrink-0 p-12 flex flex-col justify-between"
          style={{ 
            width: "1000px", 
            height: "707px",
            border: "24px solid #d4af37", // Outer gold border
            outline: "2px solid #fff", 
            outlineOffset: "-24px",
            boxShadow: "inset 0 0 0 32px #fdfbf7, inset 0 0 0 34px #d4af37, 0 20px 40px -10px rgba(0,0,0,0.3)" // Inner thin gold border
          }}
        >
          {/* Subtle background pattern (optional, adds texture) */}
          <div className="absolute inset-0 opacity-5" style={{
            backgroundImage: "radial-gradient(#d4af37 1px, transparent 1px)",
            backgroundSize: "40px 40px"
          }} />

          {/* Top Logo Area */}
          <div className="relative z-10 flex justify-center items-center mt-6">
            <div className="flex items-center gap-2">
              <span className="text-5xl font-bold tracking-tighter" style={{ color: "#d4af37" }}>SK</span>
              <div className="flex flex-col leading-none border-l-2 pl-2" style={{ borderColor: "#d4af37" }}>
                <span className="text-2xl font-bold text-[#4a4a4a] tracking-wide">StayKaro</span>
                <span className="text-xl font-medium" style={{ color: "#d4af37" }}>LMS</span>
              </div>
            </div>
          </div>
          
          {/* Main Content Area */}
          <div className="relative z-10 flex flex-col items-center text-center mt-8">
            <p className="text-xl text-[#555] font-serif mb-6 italic tracking-wide">This certifies successful completion of</p>
            
            <h1 className="text-6xl font-serif font-bold uppercase tracking-widest mb-8 border-b-2 pb-4 px-12" style={{ color: "#b89728", borderColor: "#eaddb1" }}>
              {studentName}
            </h1>
            
            <h2 className="text-2xl font-serif font-medium uppercase tracking-widest text-[#2a2a2a] mb-4">
              {courseTitle}
            </h2>
            
            <p className="text-lg text-[#666] font-serif italic">
              Demonstrating exceptional commitment and mastery.
            </p>
          </div>
          
          {/* Bottom Area (Stats & Badge) */}
          <div className="relative z-10 flex justify-between items-end w-full px-8 mb-4">
            
            {/* Stats Row */}
            <div className="flex gap-12 text-[#2a2a2a]">
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 rounded-full flex items-center justify-center mb-2" style={{ backgroundColor: "#fdf8e9" }}>
                  <span className="text-2xl">👑</span>
                </div>
                <span className="text-sm font-semibold tracking-wide text-[#666] uppercase">Rank</span>
                <span className="text-xl font-bold font-serif">1st</span>
              </div>
              
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 rounded-full flex items-center justify-center mb-2" style={{ backgroundColor: "#fdf8e9" }}>
                  <span className="text-2xl">⚡</span>
                </div>
                <span className="text-sm font-semibold tracking-wide text-[#666] uppercase">XP Earned</span>
                <span className="text-xl font-bold font-serif">25,000</span>
              </div>
              
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 rounded-full flex items-center justify-center mb-2" style={{ backgroundColor: "#fdf8e9" }}>
                  <span className="text-2xl">🔥</span>
                </div>
                <span className="text-sm font-semibold tracking-wide text-[#666] uppercase">Streak</span>
                <span className="text-xl font-bold font-serif">120 Days</span>
              </div>
              
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 rounded-full flex items-center justify-center mb-2" style={{ backgroundColor: "#fdf8e9" }}>
                  <span className="text-2xl">🎯</span>
                </div>
                <span className="text-sm font-semibold tracking-wide text-[#666] uppercase">Score</span>
                <span className="text-xl font-bold font-serif">98%</span>
              </div>
            </div>

            {/* Seal / Badge */}
            <div className="relative flex flex-col items-center justify-center">
              <div className="w-32 h-32 rounded-full border-4 border-dashed flex items-center justify-center relative shadow-lg" style={{ borderColor: "#d4af37", backgroundColor: "#f8f0d8" }}>
                <div className="absolute inset-1 rounded-full border-2" style={{ borderColor: "#d4af37" }} />
                <div className="flex flex-col items-center text-center">
                  <span className="text-[10px] tracking-widest font-bold uppercase" style={{ color: "#b89728" }}>StayKaro LMS</span>
                  <span className="text-3xl font-bold tracking-tighter my-1" style={{ color: "#d4af37" }}>SK</span>
                  <span className="text-[10px] tracking-widest font-bold uppercase" style={{ color: "#b89728" }}>Certified</span>
                </div>
              </div>
            </div>
            
          </div>
          
          {/* Small Verification Text */}
          <div className="absolute bottom-4 left-8 text-[10px] font-mono text-[#999]">
            ID: {cert.verification_code} | Date: {issueDate}
          </div>
        </div>
      </div>
      
      <div className="text-center text-sm text-muted-foreground mt-4 max-w-lg">
        This certificate is dynamically generated. Rank and XP are placeholder values for this template demonstration.
      </div>
    </div>
  );
}
