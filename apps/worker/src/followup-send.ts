import { processOutreachSend, type SendData } from "./outreach-send";
export const processFollowupSend = (data: SendData & { stepId: string }) => processOutreachSend(data);
