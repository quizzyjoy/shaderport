# the minimum version of CMake.
cmake_minimum_required(VERSION 3.5.0)
project(shaderport)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

set(NATIVERENDER_ROOT_PATH ${CMAKE_CURRENT_SOURCE_DIR})

if(DEFINED PACKAGE_FIND_FILE)
    include(${PACKAGE_FIND_FILE})
endif()

include_directories(${NATIVERENDER_ROOT_PATH})

add_library(entry SHARED napi_init.cpp renderer.cpp)

target_link_libraries(entry PUBLIC
    libace_napi.z.so
    libEGL.so
    libGLESv3.so
    libnative_window.so
    libnative_vsync.so
    libhilog_ndk.z.so)
