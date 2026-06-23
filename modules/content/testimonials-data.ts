import { TestimonialStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type ContentTestimonial = {
  id: string;
  authorName: string;
  authorRole: string;
  serviceName: string;
  quote: string;
  rating: number;
  imageUrl: string;
  featured: boolean;
};

// The live set shown in the Content rail: approved testimonials for the site,
// featured ones first. Pending/public submissions stay on the moderation page.
export async function getContentTestimonials(siteId: string): Promise<ContentTestimonial[]> {
  const testimonials = await prisma.testimonial.findMany({
    where: {
      siteId,
      status: TestimonialStatus.APPROVED
    },
    orderBy: [{ featured: "desc" }, { submittedAt: "desc" }],
    take: 24,
    select: {
      id: true,
      authorName: true,
      authorRole: true,
      serviceName: true,
      quote: true,
      rating: true,
      imageUrl: true,
      featured: true
    }
  });

  return testimonials;
}
