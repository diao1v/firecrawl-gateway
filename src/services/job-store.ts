type WebhookEventType = 'started' | 'page' | 'completed';

interface JobMetadata {
  webhookUrl?: string;
  webhookDelivered: boolean;
  webhookEvents?: WebhookEventType[];
  jobType: 'crawl' | 'batch-scrape';
  createdAt: Date;
}

class JobStore {
  private jobs = new Map<string, JobMetadata>();

  set(jobId: string, metadata: Omit<JobMetadata, 'webhookDelivered' | 'createdAt'>) {
    this.jobs.set(jobId, {
      ...metadata,
      webhookDelivered: false,
      createdAt: new Date(),
    });
  }

  // Check if job should receive a specific webhook event
  shouldDeliverEvent(jobId: string, eventType: WebhookEventType): boolean {
    const job = this.jobs.get(jobId);
    if (!job?.webhookUrl) return false;
    // If no specific events configured, deliver all
    if (!job.webhookEvents || job.webhookEvents.length === 0) return true;
    return job.webhookEvents.includes(eventType);
  }

  get(jobId: string): JobMetadata | undefined {
    return this.jobs.get(jobId);
  }

  markWebhookDelivered(jobId: string) {
    const job = this.jobs.get(jobId);
    if (job) {
      job.webhookDelivered = true;
    }
  }

  hasWebhook(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    return !!job?.webhookUrl && !job.webhookDelivered;
  }

  getWebhookUrl(jobId: string): string | undefined {
    const job = this.jobs.get(jobId);
    if (job?.webhookUrl && !job.webhookDelivered) {
      return job.webhookUrl;
    }
    return undefined;
  }

  // Atomically claim webhook for delivery (prevents race condition)
  // Returns the webhook URL if successfully claimed, undefined otherwise
  claimWebhookForDelivery(jobId: string): string | undefined {
    const job = this.jobs.get(jobId);
    if (job?.webhookUrl && !job.webhookDelivered) {
      // Mark as delivered immediately to prevent concurrent claims
      job.webhookDelivered = true;
      return job.webhookUrl;
    }
    return undefined;
  }

  // Clean up old jobs (older than 24 hours)
  cleanup() {
    const now = new Date();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    for (const [jobId, metadata] of this.jobs.entries()) {
      if (now.getTime() - metadata.createdAt.getTime() > maxAge) {
        this.jobs.delete(jobId);
      }
    }
  }
}

export const jobStore = new JobStore();

// Run cleanup every hour
setInterval(() => {
  jobStore.cleanup();
}, 60 * 60 * 1000);
