interface JobMetadata {
  webhookUrl?: string;
  webhookDelivered: boolean;
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
