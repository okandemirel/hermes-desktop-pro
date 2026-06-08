import type { CronJob, ProfileInfo } from "@shared/types";

export interface CronProfileGroup {
  profile: ProfileInfo;
  jobs: CronJob[];
  error?: string;
}

function cleanProfileName(value: string | null | undefined): string | null {
  const trimmed = String(value || "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function profileForJob(job: CronJob, fallbackProfile: string): string {
  return cleanProfileName(job.profile) || fallbackProfile || "default";
}

export function getCronJobOperationProfile(
  fallbackProfile: string,
  job: CronJob,
): string {
  return cleanProfileName(job.sourceProfile) || profileForJob(job, fallbackProfile);
}

export function groupCronJobsByProfile(
  profiles: ProfileInfo[],
  fetchedGroups: CronProfileGroup[],
): CronProfileGroup[] {
  const groupsByProfile = new Map<string, CronProfileGroup>();
  const seenJobs = new Set<string>();

  for (const profile of profiles) {
    groupsByProfile.set(profile.name, { profile, jobs: [] });
  }

  for (const fetched of fetchedGroups) {
    const fetchedProfileName = fetched.profile.name || "default";
    const fetchedGroup = groupsByProfile.get(fetchedProfileName);
    if (fetched.error && fetchedGroup) fetchedGroup.error = fetched.error;

    for (const job of fetched.jobs) {
      const targetProfileName = profileForJob(job, fetchedProfileName);
      const operationProfile = getCronJobOperationProfile(fetchedProfileName, job);
      let targetGroup = groupsByProfile.get(targetProfileName);

      if (!targetGroup) {
        targetGroup = {
          profile: {
            ...fetched.profile,
            name: targetProfileName,
            isActive: false,
            isDefault: false,
          },
          jobs: [],
        };
        groupsByProfile.set(targetProfileName, targetGroup);
      }

      const dedupeKey = `${targetProfileName}:${job.id}`;
      if (seenJobs.has(dedupeKey)) continue;
      seenJobs.add(dedupeKey);
      targetGroup.jobs.push({
        ...job,
        profile: targetProfileName,
        sourceProfile: operationProfile,
      });
    }
  }

  return Array.from(groupsByProfile.values());
}
