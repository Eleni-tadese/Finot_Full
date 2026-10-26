import { MaterialIcons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { brand } from '@/constants/brand';
import { toLocalDate, ymd } from '@/lib/calendar';
import { plainDate } from '@/lib/ethiopia-time';

type Props = { label: string; value: string; onChange: (ymdText: string) => void };

// A date as "YYYY-MM-DD" text. Android opens its own dialog; an iPhone shows the picker under the field.
export function DateField({ label, value, onChange }: Props) {
  const [showIos, setShowIos] = useState(false);

  function open() {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: toLocalDate(value),
        mode: 'date',
        onChange: (_event, picked) => {
          if (picked) onChange(ymd(picked));
        },
      });
    } else {
      setShowIos((s) => !s);
    }
  }

  return (
    <View style={styles.wrap}>
      <AppText variant="label" color={brand.muted}>
        {label}
      </AppText>
      <Pressable onPress={open} style={styles.field}>
        <MaterialIcons name="event" size={20} color={brand.primary} />
        <AppText variant="bodyStrong">{plainDate(value)}</AppText>
      </Pressable>
      {showIos ? (
        <DateTimePicker
          value={toLocalDate(value)}
          mode="date"
          display="inline"
          onChange={(_event, picked) => {
            if (picked) onChange(ymd(picked));
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: brand.background,
  },
});
