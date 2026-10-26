# kotlinx.serialization (modelos que decodifica supabase-kt)
-keepattributes *Annotation*, InnerClasses
-keep,includedescriptorclasses class com.mavros.archiver.**$$serializer { *; }
-keepclassmembers class com.mavros.archiver.** { *** Companion; }
-keepclasseswithmembers class com.mavros.archiver.** { kotlinx.serialization.KSerializer serializer(...); }
-dontwarn org.slf4j.**
