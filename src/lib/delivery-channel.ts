/**
 * When a job lists a recruiter email, email is the primary path.
 * Portal submit is used only when there is no recruiter address.
 */
export function preferredDeliveryChannel(job: { recruiterEmail?: string | null }): "email_recruiter" | "portal" {
  return job.recruiterEmail?.trim() ? "email_recruiter" : "portal";
}
