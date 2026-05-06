import { createContext, useContext, useState } from 'react';

type Canal = 'b2c' | 'b2b';

const CanalContext = createContext<{
  canal: Canal;
  setCanal: (c: Canal) => void;
}>({ canal: 'b2c', setCanal: () => {} });

export function CanalProvider({ children }: { children: React.ReactNode }) {
  const [canal, setCanal] = useState<Canal>(
    () => (localStorage.getItem('adminCanal') as Canal) || 'b2c'
  );
  const cambiar = (c: Canal) => {
    setCanal(c);
    localStorage.setItem('adminCanal', c);
  };
  return (
    <CanalContext.Provider value={{ canal, setCanal: cambiar }}>
      {children}
    </CanalContext.Provider>
  );
}

export const useCanal = () => useContext(CanalContext);
