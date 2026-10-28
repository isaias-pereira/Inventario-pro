import { useMetas } from '@/contexts/MetasContext';
import { Target } from 'lucide-react';
import MetaTab from '@/components/metas/MetaTab';


const MetasView = () => {
  return (
    <div className="relative min-h-[calc(100vh-3.5rem)] sm:min-h-[calc(100vh-4rem)] px-3 sm:px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 sm:mb-6">
          <div>
            <h2 className="mb-1 text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
              <Target className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
              Metas
            </h2>
            <p className="text-sm text-white/70">Acompanhe suas metas</p>
          </div>
        </div>

        <MetaTab />
      </div>
    </div>
  );
};

export default MetasView;
