import { View, Text } from 'react-native';
import { TrendingUp, TrendingDown } from 'lucide-react-native';

interface SummaryCardProps {
  revenue: number;
  expenses: number;
  profit: number;
  salesCount: number;
  trendPercentage: number;
}

export function SummaryCard({ revenue, expenses, profit, salesCount, trendPercentage }: SummaryCardProps) {
  const isPositive = trendPercentage >= 0;
  const isProfitPositive = profit >= 0;

  return (
    <View className="relative overflow-hidden rounded-t-[16px] px-4 pt-4 pb-5 mt-4 bg-blue-800">
      {/* Background decorations simulating the glassmorphism circles */}
      <View className="absolute -top-5 -right-5 w-24 h-24 rounded-full bg-white/5" />
      <View className="absolute -bottom-2 right-8 w-14 h-14 rounded-full bg-white/5" />

      {/* Header */}
      <View className="flex-row justify-between items-start mb-3 z-10">
        <Text className="text-[10px] uppercase font-medium text-blue-200 tracking-wider">
          Revenus Aujourd&apos;hui
        </Text>
        <Text className="text-[10px] text-blue-200 opacity-70">
          {new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
        </Text>
      </View>

      {/* Main Revenue Figure */}
      <View className="mb-1 z-10 flex-row items-end">
        <Text className="text-sm font-medium text-white/70 mr-1 mb-1">XAF</Text>
        <Text className="text-3xl font-bold text-white tracking-tight">
          {revenue.toLocaleString('fr-FR')}
        </Text>
      </View>

      {/* Trend Badge */}
      <View className={`self-start flex-row items-center rounded-md px-2 py-0.5 mb-3 z-10 ${isPositive ? 'bg-green-400/15' : 'bg-red-400/15'}`}>
        {isPositive ? (
          <TrendingUp size={10} color="#69f0ae" />
        ) : (
          <TrendingDown size={10} color="#ff8a80" />
        )}
        <Text className={`text-[10px] font-semibold ml-1 ${isPositive ? 'text-[#69f0ae]' : 'text-[#ff8a80]'}`}>
          {isPositive ? '+' : ''}{trendPercentage}% vs hier
        </Text>
      </View>

      {/* Mini Cards Row */}
      <View className="flex-row gap-2 z-10 mt-1">
        <View className="flex-1 bg-white/10 rounded-lg py-2.5 px-2.5">
          <Text className="text-[9px] uppercase font-medium text-blue-200 tracking-wider mb-1">Dépenses</Text>
          <Text className="text-[13px] font-semibold text-[#ff8a80]">{expenses.toLocaleString('fr-FR')}</Text>
        </View>
        <View className="flex-1 bg-white/10 rounded-lg py-2.5 px-2.5">
          <Text className="text-[9px] uppercase font-medium text-blue-200 tracking-wider mb-1">Bénéfice</Text>
          <Text className="text-[13px] font-semibold" style={{ color: isProfitPositive ? '#69f0ae' : '#ff8a80' }}>{profit.toLocaleString('fr-FR')}</Text>
        </View>
        <View className="flex-1 bg-white/10 rounded-lg py-2.5 px-2.5">
          <Text className="text-[9px] uppercase font-medium text-blue-200 tracking-wider mb-1">Ventes</Text>
          <Text className="text-[13px] font-semibold text-white">{salesCount}</Text>
        </View>
      </View>
    </View>
  );
}
