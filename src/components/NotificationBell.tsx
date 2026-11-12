import { Bell, AlertTriangle, Clock, CalendarClock, BellRing } from 'lucide-react';
import { useValidadeNotifications, requestPushPermission, getPushPermissionStatus } from '@/hooks/useValidadeNotifications';
import { readAlertDays, NOTIFICATION_HOURS } from '@/lib/validade-notifications';
import { format } from 'date-fns';
import { useState, useEffect } from 'react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

interface NotificationBellProps {
  onNavigateToValidade?: () => void;
}

const NotificationBell = ({ onNavigateToValidade }: NotificationBellProps) => {
  const { alerts, alertCount } = useValidadeNotifications();
  const [pushStatus, setPushStatus] = useState<NotificationPermission | 'unsupported'>('default');

  useEffect(() => {
    setPushStatus(getPushPermissionStatus());
  }, []);

  const getIcon = (status: string) => {
    switch (status) {
      case 'vencido': return <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />;
      case 'hoje': return <CalendarClock className="h-4 w-4 text-orange-500 shrink-0" />;
      default: return <Clock className="h-4 w-4 text-yellow-500 shrink-0" />;
    }
  };

  const getLabel = (status: string, days: number) => {
    if (status === 'vencido') return 'Vencido';
    if (status === 'hoje') return 'Vence hoje';
    return `Vence em ${days} dia(s)`;
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 sm:h-9 sm:w-9 text-primary-foreground/80 hover:bg-primary-foreground/10 hover:text-primary-foreground relative"
          title="Notificações"
          aria-label={alertCount > 0 ? `Notificações de validade: ${alertCount} alerta(s)` : 'Notificações de validade'}

        >
          <Bell className="h-4 w-4 sm:h-5 sm:w-5" />
          {alertCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white animate-pulse">
              {alertCount > 9 ? '9+' : alertCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b px-4 py-3 flex items-center justify-between">
          <h4 className="font-semibold text-sm">Alertas de Validade</h4>
          <div className="flex items-center gap-1">
            {alertCount > 0 && (
              <span className="text-xs text-muted-foreground">{alertCount} alerta(s)</span>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={async () => {
                const granted = await requestPushPermission();
                setPushStatus(granted ? 'granted' : getPushPermissionStatus());
              }}
              title={pushStatus === 'granted' ? 'Push ativado' : 'Ativar notificações push'}
              aria-label={pushStatus === 'granted' ? 'Notificações push ativadas' : 'Ativar notificações push'}
            >
              <BellRing className={`h-3.5 w-3.5 ${pushStatus === 'granted' ? 'text-green-500' : 'text-muted-foreground'}`} />
            </Button>
          </div>
        </div>

        <div className="border-b px-4 py-2 bg-muted/20">
          <p className="text-[11px] text-muted-foreground">
            Avisos automáticos às {NOTIFICATION_HOURS.map((hour) => `${String(hour).padStart(2, '0')}h`).join(' e ')} · produtos vencendo em até {readAlertDays()} dias
            {pushStatus !== 'granted' && ' · ative o push no ícone do sino'}
          </p>
        </div>

        <ScrollArea className="max-h-72">
          {alerts.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              Nenhum produto próximo do vencimento.
            </div>
          ) : (
            <div className="divide-y">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-start gap-3 px-4 py-3 hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={onNavigateToValidade}
                >
                  {getIcon(alert.status)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{alert.descricao}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-xs font-semibold ${
                        alert.status === 'vencido' ? 'text-red-500' :
                        alert.status === 'hoje' ? 'text-orange-500' : 'text-yellow-600'
                      }`}>
                        {getLabel(alert.status, alert.daysUntil)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(alert.validade), 'dd/MM/yyyy')}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">Qtd: {alert.quantidade}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
        {alerts.length > 0 && onNavigateToValidade && (
          <div className="border-t px-4 py-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs"
              onClick={onNavigateToValidade}
            >
              Ver todos na aba Validade
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default NotificationBell;
