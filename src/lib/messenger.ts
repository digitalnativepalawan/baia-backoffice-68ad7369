import { toast } from 'sonner';

interface MessengerEmployee {
  name: string;
  display_name?: string;
  messenger_link: string;
  active: boolean;
}

export async function sendMessengerMessage(
  employee: MessengerEmployee,
  messageContent: string,
  resortName: string
) {
  if (!employee.messenger_link?.trim()) {
    toast.error('No Messenger link configured for ' + (employee.display_name || employee.name));
    return;
  }

  if (!employee.active) {
    toast.error('Employee is inactive');
    return;
  }

  const displayName = employee.display_name || employee.name;
  const formatted = `Hi ${displayName},\n${messageContent}\n\n-- ${resortName} Admin`;

  // Copy message to clipboard for pasting
  try {
    await navigator.clipboard.writeText(formatted);
    toast.success('Message copied to clipboard');
  } catch {
    toast.info('Could not copy to clipboard — please copy manually');
  }

  // Open Messenger conversation
  const messengerUrl = `https://m.me/${employee.messenger_link.trim()}`;
  window.open(messengerUrl, '_blank');
  toast.info('Messenger opened — paste and send your message');
}
