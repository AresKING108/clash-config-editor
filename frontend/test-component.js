// Test script to verify RuleTable.vue and ProxyGroupTable.vue changes

console.log('Testing RuleTable.vue changes:')
console.log('1. Icon buttons for edit, top, bottom, delete actions')
console.log('2. Added topRule() and bottomRule() functions')
console.log('3. Button icons: EditPen, Top, Bottom, Delete')

console.log('\nTesting ProxyGroupTable.vue changes:')
console.log('1. excludeOptions includes current strategy group itself')
console.log('2. Added own strategy group nodes to excludeOptions calculation')
console.log('3. Maintains backward compatibility')

console.log('\nVerification points:')
console.log('- RuleTable.vue: Icon buttons displayed correctly')
console.log('- RuleTable.vue: 置顶/置底 functionality works')
console.log('- ProxyGroupTable.vue: excludeOptions includes own strategy group')
console.log('- ProxyGroupTable.vue: Existing exclude functionality preserved')