import { useState } from 'react';

export function usePeriodo() {
  const hoje = new Date();

  const [mes, setMes] = useState<number>(hoje.getMonth() + 1);
  const [ano, setAno] = useState<number>(hoje.getFullYear());

  return {
    mes,
    ano,
    setMes,
    setAno,
  };
}
