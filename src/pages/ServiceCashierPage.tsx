import ServiceHeader from '@/components/service/ServiceHeader';
import ServiceBoard from '@/components/service/ServiceBoard';
import CashierBoard from '@/components/service/CashierBoard';
import { Separator } from '@/components/ui/separator';

const ServiceCashierPage = () => (
  <div className="min-h-screen flex flex-col bg-navy-texture">
    <ServiceHeader department="cashier" />
    <div className="flex-1 overflow-y-auto">
      <ServiceBoard department="cashier" />
      <Separator className="my-4 mx-4" />
      <div className="pb-20">
        <CashierBoard />
      </div>
    </div>
  </div>
);

export default ServiceCashierPage;
