import { View, Text, TouchableOpacity } from 'react-native';
import { TriangleAlert, ArrowRight } from 'lucide-react-native';

interface AlertBannerProps {
  title: string;
  subtitle: string;
  onPress?: () => void;
}

export function AlertBanner({ title, subtitle, onPress }: AlertBannerProps) {
  return (
    <TouchableOpacity 
      activeOpacity={0.7}
      onPress={onPress}
      className="flex-row items-center bg-amber-50 border border-[#F5C878] rounded-xl py-2.5 px-3 mt-4"
    >
      <View className="w-7 h-7 bg-[#F5C878] rounded-lg items-center justify-center mr-2.5">
        <TriangleAlert size={14} color="#633806" strokeWidth={2.5} />
      </View>
      <View className="flex-1 justify-center">
        <Text className="text-[11px] font-semibold text-amber-800">{title}</Text>
        <Text className="text-[10px] text-amber-500 mt-0.5">{subtitle}</Text>
      </View>
      <View className="ml-2">
        <View className="flex-row items-center gap-1">
          <Text className="text-[10px] font-bold text-amber-500">Voir</Text>
          <ArrowRight size={10} color="#BA7517" />
        </View>
      </View>
    </TouchableOpacity>
  );
}
