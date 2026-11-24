import { Loader, Select } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { patientSearchQuery } from '../lib/queries';
import type { PatientOption } from '../lib/types';

interface Props {
  value: string | null;
  onChange: (id: string | null, option: PatientOption | null) => void;
  label?: string;
  placeholder?: string;
  error?: string;
  initialOption?: PatientOption | null;
  clearable?: boolean;
  w?: number | string;
}

/** Busca de paciente por nome ou CPF (mínimo 3 caracteres; nunca lista todos). */
export function PatientPicker({ value, onChange, label = 'Paciente', placeholder = 'Nome ou CPF (mín. 3 caracteres)', error, initialOption, clearable, w }: Props) {
  const [search, setSearch] = useState('');
  const [debounced] = useDebouncedValue(search, 300);
  const [selected, setSelected] = useState<PatientOption | null>(initialOption ?? null);
  const { data = [], isFetching } = useQuery(patientSearchQuery(debounced));

  const options = useMemo(() => {
    const all = selected && !data.some((p) => p.id === selected.id) ? [selected, ...data] : data;
    return all.map((p) => ({ value: p.id, label: `${p.name} — CPF ${p.documentMasked}` }));
  }, [data, selected]);

  return (
    <Select
      label={label}
      placeholder={placeholder}
      searchable
      clearable={clearable}
      w={w}
      data={options}
      value={value}
      error={error}
      filter={({ options: o }) => o}
      onSearchChange={setSearch}
      nothingFoundMessage={debounced.trim().length < 3 ? 'Digite ao menos 3 caracteres' : isFetching ? 'Buscando…' : 'Nenhum paciente encontrado'}
      rightSection={isFetching ? <Loader size="xs" /> : undefined}
      onChange={(id) => {
        const opt = [...data, ...(selected ? [selected] : [])].find((p) => p.id === id) ?? null;
        setSelected(opt);
        onChange(id, opt);
      }}
    />
  );
}
