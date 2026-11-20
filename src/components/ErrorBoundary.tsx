/**
 * Error Boundary para capturar erros não tratados no React.
 *
 * Evita que um erro em um componente derrube a aplicação inteira.
 * Mostra UI amigável e permite tentar novamente.
 *
 * Uso:
 *   <ErrorBoundary fallback={<MeuFallback />}>
 *     <MeuComponente />
 *   </ErrorBoundary>
 *
 * Ou no App.tsx para capturar erros globais:
 *   <ErrorBoundary onError={logError}>
 *     <Routes>...</Routes>
 *   </ErrorBoundary>
 */

import { Component, ErrorInfo, ReactNode, useEffect } from 'react';
import { AlertTriangle, RefreshCw, Home, Bug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { logError, createAppErrorFromException, ErrorCategory } from '@/lib/error-handler';

interface ErrorBoundaryProps {
  /** Componente renderizado quando há erro (opcional). */
  fallback?: ReactNode;
  /** Callback quando erro é capturado. */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /** Mostra botão "Recarregar página". */
  showReload?: boolean;
  /** Mostra botão "Voltar ao início". */
  showHome?: boolean;
  /** Chave para forçar reset do boundary (útil após login/logout). */
  resetKey?: unknown;
  /** Renderiza filhos mesmo com erro (para debug). */
  renderChildrenOnError?: boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ error, errorInfo });

    // Log estruturado para monitoramento
    const appError = createAppErrorFromException(error, {
      componentStack: errorInfo.componentStack,
    });
    logError(appError);

    // Callback customizado (ex.: enviar para Sentry)
    this.props.onError?.(error, errorInfo);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    // Reset quando resetKey muda (ex.: após login)
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.reset();
    }
  }

  reset = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  reloadPage = (): void => {
    window.location.reload();
  };

  goHome = (): void => {
    window.location.href = '/';
  };

  render(): ReactNode {
    const { hasError, error } = this.state;
    const { fallback, showReload = true, showHome = true, renderChildrenOnError = false } = this.props;

    if (hasError) {
      // Fallback customizado tem prioridade
      if (fallback) {
        return typeof fallback === 'function'
          ? fallback({ error: this.state.error!, reset: this.reset })
          : fallback;
      }

      // Fallback padrão do SGS-PRO
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-7 w-7 text-destructive" aria-hidden="true" />
              </div>
              <CardTitle>Algo deu errado</CardTitle>
              <CardDescription>
                Capturamos um erro inesperado. A equipe já foi notificada.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && (
                <details className="text-left">
                  <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
                    Detalhes técnicos (clique para expandir)
                  </summary>
                  <pre className="mt-2 overflow-auto rounded bg-muted p-3 text-[11px] font-mono text-foreground max-h-40">
                    {error.name}: {error.message}
                    {error.stack && `\n\n${error.stack.split('\n').slice(0, 8).join('\n')}`}
                  </pre>
                </details>
              )}

              <div className="flex flex-col sm:flex-row gap-2">
                {showReload && (
                  <Button onClick={this.reloadPage} className="flex-1 gap-2" size="lg">
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    Recarregar página
                  </Button>
                )}
                {showHome && (
                  <Button variant="outline" onClick={this.goHome} className="flex-1 gap-2" size="lg">
                    <Home className="h-4 w-4" aria-hidden="true" />
                    Voltar ao início
                  </Button>
                )}
              </div>

              <p className="text-center text-[11px] text-muted-foreground">
                Se o problema persistir, entre em contato com o suporte.
                <br />
                <span className="font-mono">Erro: {error?.name ?? 'Desconhecido'}</span>
              </p>
            </CardContent>
          </Card>
        </div>
      );
    }

    // Renderiza filhos normalmente (ou fallback se renderChildrenOnError)
    return this.props.children;
  }
}

/**
 * Hook para usar Error Boundary como HOC (Higher-Order Component).
 *
 * Uso:
 *   const MeuComponenteComBoundary = withErrorBoundary(MeuComponente, {
 *     fallback: <MeuFallback />,
 *   });
 */
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  errorBoundaryProps?: Omit<ErrorBoundaryProps, 'children'>
): React.FC<P> {
  return function WithErrorBoundary(props: P) {
    return (
      <ErrorBoundary {...errorBoundaryProps}>
        <WrappedComponent {...props} />
      </ErrorBoundary>
    );
  };
}

/**
 * Hook para resetar Error Boundary pai programaticamente.
 * Útil após operações que podem deixar o app em estado inconsistente.
 */
export function useErrorBoundaryReset(): () => void {
  // Em um hook real, isso acessaria o contexto do ErrorBoundary
  // Por simplicidade, recarrega a página
  return () => window.location.reload();
}

/** Componente para testar o Error Boundary em desenvolvimento. */
export function ErrorBoundaryTestTrigger(): ReactNode {
  const [trigger, setTrigger] = useState(false);

  useEffect(() => {
    if (trigger) {
      throw new Error('Erro de teste do ErrorBoundary');
    }
  }, [trigger]);

  return (
    <Button variant="outline" onClick={() => setTrigger(true)} className="fixed bottom-4 right-4 z-50">
      <Bug className="h-4 w-4 mr-2" /> Testar Error Boundary
    </Button>
  );
}

// Import useState para o componente de teste
import { useState } from 'react';